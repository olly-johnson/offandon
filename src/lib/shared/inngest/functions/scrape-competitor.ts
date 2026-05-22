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
        .select("id, user_id, username, platform")
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
          platform: competitor.platform as
            | "instagram"
            | "tiktok"
            | "youtube_shorts",
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

    // Look up the platform so we can route to the right parser.
    // Cheap point-read; competitor_accounts is small + indexed.
    const platform = await step.run("load-platform", async () => {
      const { data, error } = await supabase
        .from("competitor_accounts")
        .select("platform")
        .eq("id", competitor_id)
        .eq("user_id", user_id)
        .single();
      if (error || !data) {
        log.warn("load-platform fell back to instagram", {
          competitor_id,
          message: error?.message,
        });
        return "instagram" as const;
      }
      return data.platform as "instagram" | "tiktok" | "youtube_shorts";
    });

    const reels = await step.run("fetch-dataset", async () => {
      const scraper = ApifyCompetitorScraper.fromEnv();
      const items = await scraper.fetchDatasetItems(dataset_id, platform);
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
      // Apify counts the run as "succeeded" even when the dataset is
      // empty (private profile, no video posts in recent history, or
      // the actor's reel filter dropped everything). Surface that as
      // a soft error message instead of silent "Last sync: today"
      // so the operator knows why no reels appeared.
      const softError =
        reels.length === 0
          ? "Apify run succeeded but returned 0 reels. Profile may be private, image-only, or rate-limited."
          : null;
      await updateCompetitorSyncState(supabase, {
        competitorId: competitor_id,
        userId: user_id,
        lastSyncedAt: now.toISOString(),
        lastSyncError: softError,
        syncPending: false,
      });
    });

    // Auto-fan-out the latest N reels for analysis. The rest sit in
    // competitor_media and surface in the outlier feed by view count
    // even without an analysis row. 30 matches DEFAULT_RESULTS_PER_RUN
    // so a single sync covers the whole page of reels Apify returned.
    //
    // Per-platform filtering:
    //   IG / TT: list scraper returns a usable media_url, so we filter
    //     to ones with a URL and skip the ones without (image-only).
    //   YT: list scraper never returns media_url (HTML watch pages
    //     only); the downloader actor populates it asynchronously, so
    //     we keep YT reels in the candidate set regardless of url.
    //
    // Apify returns most-recent-first; sort defensively in case that
    // ever changes upstream.
    const AUTO_ANALYZE_LATEST = 30;
    const latestTopN = reels
      .filter(
        (r) =>
          platform === "youtube_shorts" || r.media_url != null,
      )
      .slice()
      .sort((a, b) => {
        const ta = a.posted_at ? Date.parse(a.posted_at) : 0;
        const tb = b.posted_at ? Date.parse(b.posted_at) : 0;
        return tb - ta;
      })
      .slice(0, AUTO_ANALYZE_LATEST);

    // Skip reels that already have an analysis row — the analyzer
    // short-circuits on those internally, but checking here avoids
    // burning Inngest invocations on the no-ops. The common path on a
    // nightly cron is "5 reels, 4 are already analysed, only 1 new" —
    // pre-filtering keeps that down to 1 event instead of 5.
    const analyzeCandidates = await step.run(
      "filter-uncached-analysis-candidates",
      async () => {
        if (latestTopN.length === 0) return [];
        const ids = latestTopN.map((r) => r.id);
        const { data: existing, error } = await supabase
          .from("competitor_media_analysis")
          .select("media_id")
          .in("media_id", ids);
        if (error) {
          // Best-effort: if the cache check fails, fall back to
          // emitting all 5 — the worker will short-circuit cached
          // ones itself.
          log.warn("filter-uncached-analysis-candidates failed", {
            message: error.message,
          });
          return latestTopN;
        }
        const cached = new Set((existing ?? []).map((r) => r.media_id));
        return latestTopN.filter((r) => !cached.has(r.id));
      },
    );

    if (analyzeCandidates.length > 0) {
      await step.run("mark-analyze-pending", async () => {
        await markCompetitorMediaAnalysisPending(supabase, {
          mediaIds: analyzeCandidates.map((r) => r.id),
        });
      });
      await step.run("emit-fanout-events", async () => {
        // YT goes through the download-first pipeline so the analyser
        // gets a fetch-stable mp4 URL. Other platforms fan out
        // straight to analysis since their media_url is already
        // populated by the list scraper.
        const eventName =
          platform === "youtube_shorts"
            ? INNGEST_EVENTS.YoutubeMediaDownloadRequested
            : INNGEST_EVENTS.CompetitorMediaAnalyzeRequested;
        await inngest.send(
          analyzeCandidates.map((r) => ({
            name: eventName,
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
