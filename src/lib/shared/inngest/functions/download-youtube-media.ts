import { ApifyYoutubeDownloader } from "@/engines/competitor/youtube-downloader";
import {
  setCompetitorMediaAnalysisFailure,
  markCompetitorMediaAnalysisPending,
} from "@/engines/competitor/media-persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  INNGEST_EVENTS,
  inngest,
  type YoutubeMediaDownloadRequestedData,
} from "../client";

const log = createLogger("inngest.download-youtube-media");

/**
 * Step 1 of the YouTube analysis chain. List scrapers can't return
 * mp4 URLs (YT doesn't expose them), so a fresh YT reel lands with
 * media_url null. This worker takes one such row, asks the YT video
 * downloader actor for a stable mp4 link, updates the row, then
 * emits the standard competitor/media.analyze.requested event so the
 * existing analyzer takes over from there.
 *
 * Per-reel rather than batched: each downloader run is independent,
 * Inngest concurrency limits the parallelism, and a single failure
 * doesn't block other reels in the same channel sync.
 */
export const downloadYoutubeMedia = inngest.createFunction(
  {
    id: "download-youtube-media",
    name: "YouTube: resolve mp4 URL + queue analysis",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: INNGEST_EVENTS.YoutubeMediaDownloadRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as YoutubeMediaDownloadRequestedData;
    const { user_id, competitor_id, media_id } = data;
    if (!user_id || !competitor_id || !media_id) {
      throw new Error(
        "youtube-media.download.requested missing user_id / competitor_id / media_id",
      );
    }

    const supabase = createSupabaseAdminClient();

    const row = await step.run("load-media", async () => {
      const { data: media, error } = await supabase
        .from("competitor_media")
        .select("id, permalink, media_url, user_id")
        .eq("id", media_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (error || !media) {
        throw new Error(
          `load-media: ${error?.message ?? "media row not found"}`,
        );
      }
      return media;
    });

    if (row.media_url) {
      log.info("media_url already set, skipping downloader", {
        user_id,
        media_id,
      });
    } else {
      if (!row.permalink) {
        await step.run("mark-no-permalink", async () => {
          await setCompetitorMediaAnalysisFailure(supabase, {
            mediaId: media_id,
            reason: "YouTube row has no watch URL; cannot download.",
          });
        });
        return { downloaded: false, reason: "no_permalink" };
      }

      try {
        const mediaUrl = await step.run("fetch-mp4", async () => {
          const downloader = ApifyYoutubeDownloader.fromEnv();
          return downloader.fetchMediaUrl(row.permalink as string);
        });

        if (!mediaUrl) {
          await step.run("mark-not-downloadable", async () => {
            await setCompetitorMediaAnalysisFailure(supabase, {
              mediaId: media_id,
              reason:
                "YouTube downloader returned no mp4 URL (private, age-gated, or removed).",
            });
          });
          return { downloaded: false, reason: "empty_dataset" };
        }

        await step.run("write-media-url", async () => {
          const { error } = await supabase
            .from("competitor_media")
            .update({ media_url: mediaUrl })
            .eq("id", media_id)
            .eq("user_id", user_id);
          if (error) {
            throw new Error(`write-media-url: ${error.message}`);
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("youtube downloader threw", { user_id, media_id, message: msg });
        await step.run("mark-failed", async () => {
          await setCompetitorMediaAnalysisFailure(supabase, {
            mediaId: media_id,
            reason: `YouTube download failed: ${msg.slice(0, 300)}`,
          });
        });
        throw err;
      }
    }

    await step.run("queue-analyse", async () => {
      await markCompetitorMediaAnalysisPending(supabase, {
        mediaIds: [media_id],
      });
      await inngest.send({
        name: INNGEST_EVENTS.CompetitorMediaAnalyzeRequested,
        data: { user_id, competitor_id, media_id },
      });
    });

    return { downloaded: true };
  },
);
