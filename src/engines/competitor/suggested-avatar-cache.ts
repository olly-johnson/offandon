/**
 * Caches a curated suggested-creator's avatar into the public
 * suggested-avatars bucket. Shared by the weekly refresh Inngest
 * function and the on-demand `npm run avatars:refresh` script so the
 * fetch -> download -> upload path lives in one tested place.
 *
 * The stored object is keyed by lowercase handle (`<handle>.webp`),
 * matching suggestedAvatarUrl() in the research UI. Avatar source URLs
 * (IG + TikTok CDN) are short-lived, so we download the bytes here and
 * re-host them; the bucket URL is what the chips render.
 */

import type { SuggestedCreator } from "@/app/(app)/research/suggested-creators";
import { createLogger } from "@/lib/shared/logger";

import type { CompetitorPlatform } from "./persistence";

const log = createLogger("competitor.suggested-avatar-cache");

export const SUGGESTED_AVATARS_BUCKET = "suggested-avatars";

export type AvatarOutcome = "uploaded" | "missing" | "failed";

/** Minimal slice of ApifyProfileScraper the cache depends on (testable). */
export interface AvatarUrlSource {
  fetchAvatarUrl(
    platform: CompetitorPlatform,
    handle: string,
  ): Promise<string | null>;
}

/** Minimal slice of the Supabase Storage file API we depend on. */
export interface AvatarStorageBucket {
  upload(
    path: string,
    body: ArrayBuffer | ArrayBufferView | Blob,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Resolve a creator's avatar URL, download it, and upsert it into the
 * bucket. Never throws: returns "missing" when no URL is available and
 * "failed" on any download / upload error (logged), so a single bad
 * creator doesn't abort a batch refresh.
 */
export async function cacheSuggestedAvatar(args: {
  creator: SuggestedCreator;
  scraper: AvatarUrlSource;
  storage: AvatarStorageBucket;
  fetchImpl?: typeof fetch;
}): Promise<AvatarOutcome> {
  const { creator, scraper, storage } = args;
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const url = await scraper.fetchAvatarUrl(creator.platform, creator.handle);
    if (!url) {
      log.warn("no avatar url returned", {
        handle: creator.handle,
        platform: creator.platform,
      });
      return "missing";
    }

    const res = await fetchImpl(url);
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

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const path = `${creator.handle.toLowerCase()}.webp`;
    const { error } = await storage.upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (error) {
      log.error("avatar upload failed", {
        handle: creator.handle,
        message: error.message,
      });
      return "failed";
    }

    log.info("avatar refreshed", {
      handle: creator.handle,
      platform: creator.platform,
      bytes: bytes.byteLength,
    });
    return "uploaded";
  } catch (err) {
    log.error("cacheSuggestedAvatar threw", {
      handle: creator.handle,
      message: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
