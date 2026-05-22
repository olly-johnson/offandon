import {
  SUGGESTED_CREATORS,
  type SuggestedCreator,
} from "@/app/(app)/research/suggested-creators";
import { ApifyProfileScraper } from "@/engines/competitor/profile-scraper";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { INNGEST_EVENTS, inngest } from "../client";

const log = createLogger("inngest.refresh-suggested-avatars");

const BUCKET = "suggested-avatars";
/**
 * Storage uploads are content-type aware: we tell Supabase what we
 * just downloaded so the bucket serves the file with the right
 * header. Instagram's CDN normalizes to JPEG; if we ever swap to a
 * different fetch source this should be derived from the response.
 */
const CONTENT_TYPE = "image/jpeg";

/**
 * Refreshes the cached avatars for the curated SUGGESTED_CREATORS
 * list. Runs weekly on Sunday at 05:00 UTC and on demand whenever
 * `research/suggested-avatars.refresh.requested` is emitted.
 *
 * For each Instagram creator: pull the profile via Apify, download
 * the avatar URL bytes, upload to the suggested-avatars bucket with
 * upsert=true. TikTok and YouTube creators are skipped because
 * those profile-scraping pipelines are not yet built; their chips
 * fall back to the gradient placeholder.
 *
 * Idempotent: re-running overwrites the same file. Per-creator
 * failures are logged but don't abort the batch; one creator going
 * private shouldn't break refreshes for the other eight.
 */
export const refreshSuggestedAvatars = inngest.createFunction(
  {
    id: "refresh-suggested-avatars",
    name: "Refresh suggested-creator avatars",
    retries: 1,
    triggers: [
      { cron: "0 5 * * 0" },
      { event: INNGEST_EVENTS.SuggestedAvatarsRefreshRequested },
    ],
  },
  async ({ step }) => {
    const scraper = ApifyProfileScraper.fromEnv();
    const admin = createSupabaseAdminClient();

    const supported = SUGGESTED_CREATORS.filter(
      (c) => c.platform === "instagram",
    );
    log.info("refresh-suggested-avatars: start", {
      total: SUGGESTED_CREATORS.length,
      instagram: supported.length,
      skipped_tt_yt:
        SUGGESTED_CREATORS.length - supported.length,
    });

    let ok = 0;
    let failed = 0;
    let missing = 0;
    for (const creator of supported) {
      const result = await step.run(
        `refresh:${creator.platform}:${creator.handle}`,
        async () => refreshOneAvatar(creator, scraper, admin),
      );
      if (result === "uploaded") ok++;
      else if (result === "missing") missing++;
      else failed++;
    }

    log.info("refresh-suggested-avatars: done", { ok, failed, missing });
    return { ok, failed, missing, skipped_tt_yt: SUGGESTED_CREATORS.length - supported.length };
  },
);

type RefreshOutcome = "uploaded" | "missing" | "failed";

async function refreshOneAvatar(
  creator: SuggestedCreator,
  scraper: ApifyProfileScraper,
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<RefreshOutcome> {
  try {
    const url = await scraper.fetchInstagramAvatarUrl(creator.handle);
    if (!url) {
      log.warn("no avatar url returned", { handle: creator.handle });
      return "missing";
    }
    const res = await fetch(url);
    if (!res.ok) {
      log.warn("avatar fetch non-2xx", {
        handle: creator.handle,
        status: res.status,
      });
      return "failed";
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      log.warn("avatar fetch empty body", { handle: creator.handle });
      return "failed";
    }

    const path = `${creator.handle.toLowerCase()}.webp`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: CONTENT_TYPE,
      upsert: true,
    });
    if (error) {
      log.error("supabase upload failed", {
        handle: creator.handle,
        message: error.message,
      });
      return "failed";
    }

    log.info("avatar refreshed", {
      handle: creator.handle,
      bytes: bytes.byteLength,
    });
    return "uploaded";
  } catch (err) {
    log.error("refreshOneAvatar threw", {
      handle: creator.handle,
      message: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
