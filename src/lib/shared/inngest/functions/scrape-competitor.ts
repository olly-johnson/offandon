import { ApifyCompetitorScraper } from "@/engines/competitor/scraper";
import {
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
      });
    });

    log.info("apify scrape ingested", {
      competitor_id,
      user_id,
      actor_run_id,
      reel_count: reels.length,
    });
    return { succeeded: true, count: reels.length };
  },
);
