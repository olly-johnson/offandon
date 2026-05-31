/**
 * scripts/import-checkins-csv.ts
 *
 * One-off importer for historical weekly check-ins exported from GHL
 * (BO-077). Export the "Off&On Weekly Check-In" survey submissions to CSV
 * from the GHL UI, then point this at the file. Each row is matched to a
 * Bot OS user by email, parsed into structured metrics, and saved through
 * the same saveCheckin used by the live webhooks - so historical weeks
 * show up on the dashboard's "Your Weekly Progress" card.
 *
 * Idempotent: saveCheckin is unique on (user, week), so re-running skips
 * weeks already present (reported as "duplicate").
 *
 * Usage:
 *   npm run checkin:import-csv -- --file=./export.csv --dry-run
 *   npm run checkin:import-csv -- --file=./export.csv
 *   npm run checkin:import-csv -- --file=./export.csv --inspect   # show detected columns + first row, no writes
 *
 * Requires (in .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * The metrics migration (20260531000000_checkin_metrics) must be applied.
 */

import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  extractCheckinMetrics,
  mapCsvRowsToCheckins,
  saveCheckin,
} from "@/engines/weekly-checkin";
import type { Database } from "@/lib/shared/supabase";
import { parseCsv } from "@/lib/shared/csv";
import { isoWeekStart } from "@/lib/shared/week";

import { loadEnvLocal } from "./_env";

function parseArgs(argv: string[]): {
  file?: string;
  dryRun: boolean;
  inspect: boolean;
} {
  const args = new Map<string, string | true>();
  for (const part of argv.slice(2)) {
    if (!part.startsWith("--")) continue;
    const [k, v] = part.slice(2).split("=", 2);
    args.set(k, v ?? true);
  }
  const file = args.get("file");
  return {
    file: typeof file === "string" ? file : undefined,
    dryRun: args.has("dry-run"),
    inspect: args.has("inspect"),
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { file, dryRun, inspect } = parseArgs(process.argv);

  if (!file) {
    console.error("missing --file=<path to GHL submissions CSV>");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, "utf8"));
  const checkins = mapCsvRowsToCheckins(rows);
  console.log(`parsed ${rows.length} CSV row(s), ${checkins.length} with an email`);

  if (inspect) {
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    console.log("\nheaders:", headers);
    console.log("\nfirst mapped check-in:", JSON.stringify(checkins[0], null, 2));
    console.log(
      "\nextracted metrics:",
      JSON.stringify(checkins[0] ? extractCheckinMetrics(checkins[0].answers) : null, null, 2),
    );
    console.log("\n(inspect only - nothing written)");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env.local)");
    process.exit(1);
  }
  const supabase = createClient<Database>(url, serviceKey);

  // Build an email -> user_id map once (same listUsers approach as the webhooks).
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    console.error(`listUsers failed: ${usersRes.error.message}`);
    process.exit(1);
  }
  const byEmail = new Map<string, string>();
  for (const u of usersRes.data.users) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
  }

  console.log(`importing — ${dryRun ? "DRY RUN" : "WRITING"}`);
  let saved = 0;
  let duplicate = 0;
  let unknownUser = 0;

  for (const c of checkins) {
    const userId = byEmail.get(c.email);
    if (!userId) {
      unknownUser++;
      console.log(`  no user for ${c.email} — skipped`);
      continue;
    }
    const submittedAt = c.submittedAt ? new Date(c.submittedAt) : new Date();
    const weekStart = isoWeekStart(submittedAt);

    if (dryRun) {
      console.log(
        `  would save ${c.email} week ${weekStart}: ${JSON.stringify(extractCheckinMetrics(c.answers))}`,
      );
      saved++;
      continue;
    }

    const { duplicated } = await saveCheckin(supabase, {
      userId,
      weekStart,
      rawResponses: c.answers,
      submittedAt: submittedAt.toISOString(),
      metrics: extractCheckinMetrics(c.answers),
    });
    if (duplicated) {
      duplicate++;
    } else {
      saved++;
    }
  }

  console.log(
    `done. ${dryRun ? "would-save" : "saved"}=${saved} duplicate=${duplicate} unknown-user=${unknownUser}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
