/**
 * scripts/backfill-fathom.ts
 *
 * BO-061: paginate Fathom's /external/v1/meetings endpoint, resolve each
 * recording to a Bot OS user by intersecting calendar_invitees with
 * auth.users, and ingest the transcript through the shared corpus engine.
 *
 * Idempotent by source_path (`fathom://<recording_id>`), so safe to re-run.
 *
 * Usage:
 *   npm run backfill:fathom
 *   npm run backfill:fathom -- --since=2025-01-01  (cuts off older recordings)
 *   npm run backfill:fathom -- --dry-run            (lists what would happen)
 *   npm run backfill:fathom -- --limit=5            (stop after N ingests)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * VOYAGE_API_KEY, FATHOM_API_KEY in the environment.
 *
 * FATHOM_OPERATOR_EMAILS (comma-separated) is honoured the same way the
 * webhook honours it: filters operator attendees out before picking the
 * client. Setting it is not strictly required when invitees are tagged
 * with is_external, but recommended.
 */

import { createClient } from "@supabase/supabase-js";

import {
  FathomApiClient,
  ingestFathomRecording,
  pickClientInvitee,
} from "@/engines/fathom";
import { VoyageEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

interface Args {
  since: Date | null;
  dryRun: boolean;
  limit: number;
  pageSize: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { since: null, dryRun: false, limit: 0, pageSize: 25 };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      out.dryRun = true;
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
  const operatorEmails = (process.env.FATHOM_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });
  const fathom = new FathomApiClient({ apiKey: fathomKey });

  console.log("loading auth.users for email -> user_id mapping...");
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    throw new Error(`listUsers failed: ${usersRes.error.message}`);
  }
  const emailToUserId = new Map<string, string>();
  for (const u of usersRes.data.users) {
    if (u.email) emailToUserId.set(u.email.toLowerCase(), u.id);
  }
  console.log(`  found ${emailToUserId.size} users with an email address`);

  if (args.since) console.log(`since: ${args.since.toISOString()}`);
  if (args.dryRun) console.log("DRY RUN: no writes will happen");

  let cursor: string | null = null;
  let scanned = 0;
  let ingested = 0;
  const skipReasons = new Map<string, number>();
  const bumpSkip = (reason: string) =>
    skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);

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

      const client = pickClientInvitee(recording.invitees, operatorEmails);
      if (!client) {
        bumpSkip("no_client_invitee");
        continue;
      }
      const userId = emailToUserId.get(client.email);
      if (!userId) {
        bumpSkip("no_matching_user");
        continue;
      }

      if (args.dryRun) {
        console.log(
          `  WOULD INGEST  ${recording.recordingId}  ${recording.startedAt}  ${client.email}  "${recording.title}"`,
        );
        ingested += 1;
      } else {
        try {
          const result = await ingestFathomRecording(
            { supabase, embeddings },
            { userId, recording },
          );
          console.log(
            `  ingested      ${recording.recordingId}  -> ${result.documentId}  chunks=${result.chunkCount}  (${client.email})`,
          );
          ingested += 1;
        } catch (err) {
          console.error(
            `  FAILED        ${recording.recordingId}  ${(err as Error).message}`,
          );
          bumpSkip("ingest_error");
        }
      }

      if (args.limit > 0 && ingested >= args.limit) {
        console.log(`reached --limit=${args.limit}, stopping`);
        cursor = null;
        break;
      }
    }

    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  console.log("");
  console.log(`scanned:  ${scanned}`);
  console.log(`ingested: ${ingested}`);
  for (const [reason, count] of skipReasons.entries()) {
    console.log(`skipped:  ${count}  (${reason})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
