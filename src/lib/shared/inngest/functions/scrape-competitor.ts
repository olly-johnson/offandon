import { ApifyCompetitorScraper } from "@/engines/competitor/scraper";
import {
  markCompetitorMediaAnalysisPending,
  updateCompetitorSyncState,
  upsertCompetitorMedia,
} from "@/engines/competitor/media-persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  INNGEST_EVENTS,
  inngest,
  type CompetitorScrapeCompletedData,
  type CompetitorScrapeRequestedData,
} from "../client";

const log = createLogger("inngest.scrape-competitor");

const DEFAULT_RESULTS_PER_RUN = 30;

function resolveAppBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit && explicit.trim() !== "") return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel && vercel.trim() !== "") return `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * "Sync now" handler. Started by the server action on /research; ends
 * with an Apify actor run that will POST back to /api/apify/webhook
 * when it finishes (or fails). We don't poll Apify here because a
 * scrape can take ~30-90s, well past what a single serverless function
 * should hold open.
 */
export const competitorScrapeRequested = inngest.createFunction(
  {
    id: "competitor-scrape-requested",
    name: "Competitor scrape: start Apify run",
    retries: 2,
    triggers: [{ event: INNGEST_EVENTS.CompetitorScrapeRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as CompetitorScrapeRequestedData;
    const { competitor_id, user_id } = data;
    if (!competitor_id || !user_id) {
      throw new Error(
        "competitor/scrape.requested missing competitor_id or user_id",
      );
    }

    if (process.env.COMPETITOR_SCRAPE_DISABLED === "1") {
      log.warn("scrape short-circuited by COMPETITOR_SCRAPE_DISABLED=1", {
        competitor_id,
        user_id,
      });
      return { skipped: "disabled" };
    }

    const supabase = createSupabaseAdminClient();

    const competitor = await step.run("load-competitor", async () => {
      const { data: row, error } = await supabase
        .from("competitor_accounts")
        .select("id, user_id, username")
        .eq("id", competitor_id)
        .eq("user_id", user_id)
        .single();
      if (error || !row) {
        throw new Error(`load-competitor: ${error?.message ?? "not found"}`);
      }
      return row;
    });

    await step.run("mark-in-flight", async () => {
      await updateCompetitorSyncState(supabase, {
        competitorId: competitor.id,
        userId: competitor.user_id,
        lastSyncedAt: null,
        lastSyncError: null,
        syncPending: true,
      });
    });

    const webhookUrl = `${resolveAppBaseUrl()}/api/apify/webhook`;

    try {
      const run = await step.run("start-apify-run", async () => {
        const scraper = ApifyCompetitorScraper.fromEnv();
        return scraper.startReelScrape({
          username: competitor.username,
          resultsLimit: DEFAULT_RESULTS_PER_RUN,
          webhookUrl,
          runMetadata: {
            competitor_id: competitor.id,
            user_id: competitor.user_id,
          },
        });
      });

      log.info("apify run started", {
        competitor_id,
        user_id,
        actor_run_id: run.actorRunId,
        dataset_id: run.defaultDatasetId,
      });
      return {
        actor_run_id: run.actorRunId,
        dataset_id: run.defaultDatasetId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await updateCompetitorSyncState(supabase, {
        competitorId: competitor.id,
        userId: competitor.user_id,
        lastSyncedAt: null,
        lastSyncError: message.slice(0, 500),
        syncPending: false,
      });
      throw err;
    }
  },
);

/**
 * Receives the Inngest event emitted by /api/apify/webhook once Apify
 * finishes a run. On success, fetches the dataset items, upserts the
 * reels, and bumps the sync stamps. On non-success statuses we just
 * record the failure on the competitor row.
 */
export const competitorScrapeCompleted = inngest.createFunction(
  {
    id: "competitor-scrape-completed",
    name: "Competitor scrape: ingest Apify dataset",
    retries: 2,
    triggers: [{ event: INNGEST_EVENTS.CompetitorScrapeCompleted }],
  },
  async ({ event, step }) => {
    const data = event.data as CompetitorScrapeCompletedData;
    const {
      competitor_id,
      user_id,
      actor_run_id,
      dataset_id,
      succeeded,
      status,
    } = data;
    if (!competitor_id || !user_id || !dataset_id) {
      throw new Error(
        "competitor/scrape.completed event missing competitor_id, user_id, or dataset_id",
      );
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date();

    if (!succeeded) {
      await step.run("record-failure", async () => {
        await updateCompetitorSyncState(supabase, {
          competitorId: competitor_id,
          userId: user_id,
          lastSyncedAt: null,
          lastSyncError: `Apify run ${status}`,
          syncPending: false,
        });
      });
      log.warn("apify run did not succeed", {
        competitor_id,
        user_id,
        actor_run_id,
        status,
      });
      return { succeeded: false, status };
    }

    const reels = await step.run("fetch-dataset", async () => {
      const scraper = ApifyCompetitorScraper.fromEnv();
      const items = await scraper.fetchDatasetItems(dataset_id);
      return items;
    });

    await step.run("upsert-media", async () => {
      await upsertCompetitorMedia(supabase, {
        competitorId: competitor_id,
        userId: user_id,
        scrapeRunId: actor_run_id,
        reels,
        now,
      });
    });

    await step.run("mark-synced", async () => {
      await updateCompetitorSyncState(supabase, {
        competitorId: competitor_id,
        userId: user_id,
        lastSyncedAt: now.toISOString(),
        lastSyncError: null,
        syncPending: false,
      });
    });

    // Auto-fan-out only the latest N reels — the rest stay in
    // competitor_media for the drill-in page, which exposes a manual
    // "Analyze" button per reel. Keeps the cost of a nightly cron
    // sweep bounded (5 reels × Deepgram+Sonnet ≈ $0.05/competitor)
    // while still letting users drill deeper on demand.
    //
    // Apify returns most-recent-first; sort defensively in case that
    // ever changes upstream. Reels without a media_url get skipped
    // (no audio to feed Deepgram) and the analyzer itself short-
    // circuits when an analysis row already exists, so re-syncs are
    // cheap.
    const AUTO_ANALYZE_LATEST = 5;
    const analyzeCandidates = reels
      .filter((r) => r.media_url != null)
      .slice()
      .sort((a, b) => {
        const ta = a.posted_at ? Date.parse(a.posted_at) : 0;
        const tb = b.posted_at ? Date.parse(b.posted_at) : 0;
        return tb - ta;
      })
      .slice(0, AUTO_ANALYZE_LATEST);
    if (analyzeCandidates.length > 0) {
      await step.run("mark-analyze-pending", async () => {
        await markCompetitorMediaAnalysisPending(supabase, {
          mediaIds: analyzeCandidates.map((r) => r.id),
        });
      });
      await step.run("emit-analyze-events", async () => {
        await inngest.send(
          analyzeCandidates.map((r) => ({
            name: INNGEST_EVENTS.CompetitorMediaAnalyzeRequested,
            data: {
              user_id,
              competitor_id,
              media_id: r.id,
            },
          })),
        );
      });
    }

    log.info("apify scrape ingested", {
      competitor_id,
      user_id,
      actor_run_id,
      reel_count: reels.length,
      analyze_queued: analyzeCandidates.length,
    });
    return {
      succeeded: true,
      count: reels.length,
      analyze_queued: analyzeCandidates.length,
    };
  },
);

/**
 * Nightly competitor refresh. Iterates every competitor_accounts row
 * and emits one competitor/scrape.requested event per row; the rest of
 * the chain (scrape -> webhook -> ingest -> auto-analyse latest 5)
 * handles each independently.
 *
 * Same shape as syncInstagram (BO-005). The kill switch is the same
 * COMPETITOR_SCRAPE_DISABLED env var as manual sync — when set, the
 * downstream `competitor-scrape-requested` worker short-circuits.
 *
 * Cron: 04:00 UTC nightly. Chosen so it lands before working hours in
 * APAC where the cohort actually opens the dashboard.
 */
export const syncAllCompetitorsNightly = inngest.createFunction(
  {
    id: "sync-all-competitors-nightly",
    name: "Competitors: nightly refresh",
    retries: 1,
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    const supabase = createSupabaseAdminClient();

    const rows = await step.run("list-competitors", async () => {
      const { data, error } = await supabase
        .from("competitor_accounts")
        .select("id, user_id");
      if (error) throw new Error(`list-competitors: ${error.message}`);
      return (data ?? []) as Array<{ id: string; user_id: string }>;
    });

    log.info("competitor nightly sync starting", { count: rows.length });

    if (rows.length === 0) return { count: 0 };

    // Mark every row as in-flight up front so the UI immediately shows
    // "Syncing..." across the cohort, then fire one event per row.
    await step.run("mark-in-flight", async () => {
      const ids = rows.map((r) => r.id);
      const { error } = await supabase
        .from("competitor_accounts")
        .update({
          sync_pending: true,
          last_synced_at: null,
          last_sync_error: null,
        })
        .in("id", ids);
      if (error) throw new Error(`mark-in-flight: ${error.message}`);
    });

    await step.run("emit-scrape-events", async () => {
      await inngest.send(
        rows.map((r) => ({
          name: INNGEST_EVENTS.CompetitorScrapeRequested,
          data: { competitor_id: r.id, user_id: r.user_id },
        })),
      );
    });

    log.info("competitor nightly sync queued", { count: rows.length });
    return { count: rows.length };
  },
);
