import { SUGGESTED_CREATORS } from "@/app/(app)/research/suggested-creators";
import { ApifyProfileScraper } from "@/engines/competitor/profile-scraper";
import {
  cacheSuggestedAvatar,
  SUGGESTED_AVATARS_BUCKET,
} from "@/engines/competitor/suggested-avatar-cache";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { INNGEST_EVENTS, inngest } from "../client";

const log = createLogger("inngest.refresh-suggested-avatars");

/**
 * Refreshes the cached avatars for the curated SUGGESTED_CREATORS
 * list. Runs weekly on Sunday at 05:00 UTC and on demand whenever
 * `research/suggested-avatars.refresh.requested` is emitted.
 *
 * For each Instagram + TikTok creator: resolve the profile avatar via
 * Apify, download the bytes, upload to the suggested-avatars bucket
 * with upsert=true. YouTube creators are skipped (the surface is
 * disabled); their chips fall back to the gradient placeholder.
 *
 * Idempotent: re-running overwrites the same file. Per-creator
 * failures are logged but don't abort the batch; one creator going
 * private shouldn't break refreshes for the others.
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
    const storage = admin.storage.from(SUGGESTED_AVATARS_BUCKET);

    const supported = SUGGESTED_CREATORS.filter(
      (c) => c.platform === "instagram" || c.platform === "tiktok",
    );
    log.info("refresh-suggested-avatars: start", {
      total: SUGGESTED_CREATORS.length,
      supported: supported.length,
      skipped_yt: SUGGESTED_CREATORS.length - supported.length,
    });

    let ok = 0;
    let failed = 0;
    let missing = 0;
    for (const creator of supported) {
      const result = await step.run(
        `refresh:${creator.platform}:${creator.handle}`,
        async () => cacheSuggestedAvatar({ creator, scraper, storage }),
      );
      if (result === "uploaded") ok++;
      else if (result === "missing") missing++;
      else failed++;
    }

    log.info("refresh-suggested-avatars: done", { ok, failed, missing });
    return {
      ok,
      failed,
      missing,
      skipped_yt: SUGGESTED_CREATORS.length - supported.length,
    };
  },
);
