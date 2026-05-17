/**
 * scripts/backfill-fathom.ts
 *
 * BO-061: paginate Fathom's /external/v1/meetings endpoint, resolve every
 * attendee on each recording to a Bot OS user (via auth.users.email or
 * public.fathom_email_aliases), and ingest the transcript through the
 * shared corpus engine — once per matched user. The operator's site
 * account AND every client with a site account both get the transcript.
 *
 * Idempotent by `(user_id, source_path)`, so safe to re-run after adding
 * more aliases.
 *
 * Usage:
 *   npm run backfill:fathom
 *   npm run backfill:fathom -- --since=2025-01-01      cut off older recordings
 *   npm run backfill:fathom -- --dry-run               list what would happen
 *   npm run backfill:fathom -- --limit=5               stop after N recordings
 *   npm run backfill:fathom -- --unmatched             print only the unmatched-emails report
 *
 * `--unmatched` mode does NOT ingest. It walks the whole history and
 * prints every Fathom email that appeared on a recording but didn't map
 * to a site user, sorted by frequency. Use it to populate
 * fathom_email_aliases via `npm run fathom:aliases -- --add`.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * VOYAGE_API_KEY, FATHOM_API_KEY in the environment.
 */

import { createClient } from "@supabase/supabase-js";

import {
  FathomApiClient,
  ingestFathomRecording,
  loadAuthUserEmailIndex,
  resolveAttendees,
} from "@/engines/fathom";
import { VoyageEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

interface Args {
  since: Date | null;
  dryRun: boolean;
  limit: number;
  pageSize: number;
  unmatchedOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    since: null,
    dryRun: false,
    limit: 0,
    pageSize: 25,
    unmatchedOnly: false,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--unmatched") {
      out.unmatchedOnly = true;
    } else if (arg.startsWith("--since=")) {
      const v = arg.slice("--since=".length);
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        throw new Error(`--since must be a parseable date, got "${v}"`);
      }
      out.since = d;
    } else if (arg.startsWith("--limit=")) {
      out.limit = Number.parseInt(arg.slice("--limit=".length), 10) || 0;
    } else if (arg.startsWith("--page-size=")) {
      out.pageSize = Number.parseInt(arg.slice("--page-size=".length), 10) || 25;
    }
  }
  return out;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;
  const fathomKey = process.env.FATHOM_API_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!voyageKey) throw new Error("VOYAGE_API_KEY is required");
  if (!fathomKey) throw new Error("FATHOM_API_KEY is required");

  const args = parseArgs(process.argv.slice(2));

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });
  const fathom = new FathomApiClient({ apiKey: fathomKey });

  console.log("loading auth.users for email -> user_id mapping...");
  const emailIndex = await loadAuthUserEmailIndex(supabase);
  console.log(`  found ${emailIndex.size} users with an email address`);

  if (args.since) console.log(`since: ${args.since.toISOString()}`);
  if (args.dryRun) console.log("DRY RUN: no writes will happen");
  if (args.unmatchedOnly) console.log("UNMATCHED-ONLY: scanning, not ingesting");

  let cursor: string | null = null;
  let scanned = 0;
  let ingestedRows = 0;
  let recordingsIngested = 0;
  const unmatchedCounts = new Map<string, number>();
  const skipReasons = new Map<string, number>();
  const bumpSkip = (reason: string) =>
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
  const bumpUnmatched = (email: string) =>
    unmatchedCounts.set(email, (unmatchedCounts.get(email) ?? 0) + 1);

  while (true) {
    const page = await fathom.listMeetings({ limit: args.pageSize, cursor });
    if (page.items.length === 0 && !page.nextCursor) break;

    for (const recording of page.items) {
      scanned += 1;
      if (args.since && new Date(recording.startedAt) < args.since) {
        bumpSkip("older_than_since");
        continue;
      }
      if (recording.transcriptPlaintext.trim().length === 0) {
        bumpSkip("no_transcript");
        continue;
      }

      const resolution = await resolveAttendees(supabase, emailIndex, recording);
      for (const e of resolution.unmatchedEmails) bumpUnmatched(e);

      if (resolution.matched.length === 0) {
        bumpSkip("no_matched_attendee");
        continue;
      }
      if (args.unmatchedOnly) {
        // Don't ingest in unmatched-only mode, just keep counting.
        continue;
      }

      const userList = resolution.matched
        .map((m) => `${m.email} -> ${m.userId.slice(0, 8)}`)
        .join(", ");

      if (args.dryRun) {
        console.log(
          `  WOULD INGEST  ${recording.recordingId}  ${recording.startedAt}  "${recording.title}"  for: ${userList}`,
        );
        recordingsIngested += 1;
        ingestedRows += resolution.matched.length;
        continue;
      }

      for (const attendee of resolution.matched) {
        try {
          const result = await ingestFathomRecording(
            { supabase, embeddings },
            { userId: attendee.userId, recording },
          );
          console.log(
            `  ingested      ${recording.recordingId}  -> doc=${result.documentId.slice(0, 8)}  chunks=${result.chunkCount}  user=${attendee.email}`,
          );
          ingestedRows += 1;
        } catch (err) {
          console.error(
            `  FAILED        ${recording.recordingId}  user=${attendee.email}  ${(err as Error).message}`,
          );
          bumpSkip("ingest_error");
        }
      }
      recordingsIngested += 1;

      if (args.limit > 0 && recordingsIngested >= args.limit) {
        console.log(`reached --limit=${args.limit}, stopping`);
        cursor = null;
        break;
      }
    }

    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  console.log("");
  console.log(`scanned recordings:  ${scanned}`);
  console.log(`recordings ingested: ${recordingsIngested}`);
  console.log(`document rows:       ${ingestedRows}`);
  for (const [reason, count] of skipReasons.entries()) {
    console.log(`skipped: ${count}  (${reason})`);
  }

  if (unmatchedCounts.size > 0) {
    console.log("");
    console.log("Unmatched Fathom emails (frequency desc). Map these via:");
    console.log("  npm run fathom:aliases -- --add <user_id> <email>");
    console.log("");
    const sorted = Array.from(unmatchedCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    for (const [email, count] of sorted) {
      console.log(`  ${String(count).padStart(4)}  ${email}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
