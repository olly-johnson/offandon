/**
 * scripts/backfill-checkin-metrics.ts
 *
 * One-off backfill for BO-076. Existing weekly_checkins rows predate the
 * structured metric columns, so their new_followers / dms_received / ...
 * are NULL even though the numbers are sitting in raw_responses. This
 * re-runs extractCheckinMetrics over each row's stored answers and writes
 * the parsed metrics back, so the dashboard's "Your Weekly Progress" card
 * shows history rather than only weeks submitted after the feature shipped.
 *
 * Idempotent: re-running re-parses and re-writes the same values. By
 * default rows that already have at least one metric are skipped; pass
 * --force to re-parse every row.
 *
 * Usage:
 *   npm run checkin:backfill -- --dry-run     # report only, no writes
 *   npm run checkin:backfill                  # backfill rows missing metrics
 *   npm run checkin:backfill -- --force       # re-parse every row
 *
 * Requires (in .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. The metrics migration
 * (20260531000000_checkin_metrics) must already be applied.
 */

import { createClient } from "@supabase/supabase-js";

import { extractCheckinMetrics } from "@/engines/weekly-checkin";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

const PAGE = 500;

function parseArgs(argv: string[]): { dryRun: boolean; force: boolean } {
  const flags = new Set(
    argv.slice(2).filter((p) => p.startsWith("--")).map((p) => p.slice(2)),
  );
  return { dryRun: flags.has("dry-run"), force: flags.has("force") };
}

/** Coerce a stored raw_responses jsonb into the Record<string,string> the extractor wants. */
function toAnswers(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = typeof v === "string" ? v : v == null ? "" : String(v);
  }
  return out;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { dryRun, force } = parseArgs(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("set them in .env.local before running this script");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceKey);
  console.log(
    `backfill checkin metrics — ${dryRun ? "DRY RUN" : "WRITING"}${force ? " (force)" : ""}`,
  );

  let from = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let empty = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("weekly_checkins")
      .select(
        "id, raw_responses, new_followers, dms_received, calls_booked, sales_closed, leads_generated, revenue, posts_published, satisfaction",
      )
      .order("week_start", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`select failed: ${error.message}`);
      process.exit(1);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      scanned++;

      const alreadyHasMetrics =
        row.new_followers != null ||
        row.dms_received != null ||
        row.calls_booked != null ||
        row.sales_closed != null ||
        row.leads_generated != null ||
        row.revenue != null ||
        row.posts_published != null ||
        row.satisfaction != null;
      if (alreadyHasMetrics && !force) {
        skipped++;
        continue;
      }

      const metrics = extractCheckinMetrics(toAnswers(row.raw_responses));
      const allNull = Object.values(metrics).every((v) => v === null);
      if (allNull) {
        empty++;
        continue;
      }

      if (dryRun) {
        console.log(`  would update ${row.id}: ${JSON.stringify(metrics)}`);
        updated++;
        continue;
      }

      const { error: updErr } = await supabase
        .from("weekly_checkins")
        .update({
          new_followers: metrics.newFollowers,
          dms_received: metrics.dmsReceived,
          calls_booked: metrics.callsBooked,
          sales_closed: metrics.salesClosed,
          leads_generated: metrics.leadsGenerated,
          revenue: metrics.revenue,
          posts_published: metrics.postsPublished,
          satisfaction: metrics.satisfaction,
        })
        .eq("id", row.id);
      if (updErr) {
        console.error(`  update ${row.id} failed: ${updErr.message}`);
        process.exitCode = 1;
        continue;
      }
      updated++;
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(
    `done. scanned=${scanned} ${dryRun ? "would-update" : "updated"}=${updated} skipped=${skipped} no-numbers=${empty}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
