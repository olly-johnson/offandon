/**
 * Thumbnail caching for competitor reels.
 *
 * TikTok cover URLs from the scraper are short-lived signed CDN links
 * (an `x-expires` query param, valid for a few hours). By the time a
 * user views their watchlist - or Next's image optimizer fetches the
 * cover server-side - the signature is dead and the tile renders
 * blank. Instagram covers go through Next's optimizer (which caches
 * them) and YouTube is disabled, so only TikTok needs this.
 *
 * The fix: at scrape time, while the signed URL is still valid, copy
 * each cover into our own public Supabase Storage bucket and rewrite
 * thumbnail_url to that stable URL before it lands in competitor_media.
 * Mirrors the suggested-avatars caching pattern.
 *
 * Failure handling: if a download or upload fails we keep the original
 * source URL for that reel rather than pointing at an object that may
 * not exist. Scrapes return fresh signed URLs every run, so a transient
 * failure self-heals on the next sync.
 */

import { createLogger } from "@/lib/shared/logger";

import type { CompetitorPlatform } from "./persistence";
import type { CompetitorReel } from "./scraper";

const log = createLogger("competitor.thumbnail-cache");

export const COMPETITOR_THUMBNAILS_BUCKET = "competitor-thumbnails";

/** Per-image download timeout. Covers are tiny; a slow one isn't worth waiting on. */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Minimal slice of the Supabase Storage file API we depend on, so the
 * cache logic can be unit-tested with a fake bucket. `admin.storage
 * .from(COMPETITOR_THUMBNAILS_BUCKET)` satisfies this shape.
 */
export interface ThumbnailStorageBucket {
  upload(
    path: string,
    body: ArrayBuffer | ArrayBufferView | Blob,
    options?: { contentType?: string; upsert?: boolean },
  ): Promise<{ data: unknown; error: { message: string } | null }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

/**
 * Deterministic storage path for a reel's cover. Namespaced by platform
 * so ids from different platforms can never collide, and stable across
 * syncs so re-caching overwrites the same object.
 */
export function competitorThumbnailPath(
  platform: CompetitorPlatform,
  mediaId: string,
): string {
  return `${platform}/${mediaId}.jpg`;
}

interface DownloadedImage {
  body: ArrayBuffer;
  contentType: string;
}

async function downloadImage(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<DownloadedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.arrayBuffer();
    if (body.byteLength === 0) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    return { body, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Copy each TikTok reel's cover into the public bucket and rewrite its
 * thumbnail_url to the stable public URL. Other platforms pass through
 * unchanged. Never throws: per-reel failures fall back to the original
 * URL and are logged.
 */
export async function cacheReelThumbnails(args: {
  storage: ThumbnailStorageBucket;
  platform: CompetitorPlatform;
  reels: CompetitorReel[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CompetitorReel[]> {
  const { storage, platform, reels } = args;
  // Only TikTok has the expiring-URL problem worth caching for.
  if (platform !== "tiktok") return reels;

  const fetchImpl = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return Promise.all(
    reels.map(async (reel) => {
      const source = reel.thumbnail_url;
      if (!source) return reel;
      const path = competitorThumbnailPath(platform, reel.id);
      try {
        const image = await downloadImage(fetchImpl, source, timeoutMs);
        if (!image) return reel;
        const { error } = await storage.upload(path, image.body, {
          contentType: image.contentType,
          upsert: true,
        });
        if (error) {
          log.warn("thumbnail upload failed; keeping source url", {
            media_id: reel.id,
            message: error.message,
          });
          return reel;
        }
        return { ...reel, thumbnail_url: storage.getPublicUrl(path).data.publicUrl };
      } catch (err) {
        log.warn("thumbnail cache threw; keeping source url", {
          media_id: reel.id,
          message: err instanceof Error ? err.message : String(err),
        });
        return reel;
      }
    }),
  );
}
