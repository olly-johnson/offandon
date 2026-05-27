import { describe, expect, it, vi } from "vitest";

import {
  cacheReelThumbnails,
  competitorThumbnailPath,
  type ThumbnailStorageBucket,
} from "./thumbnail-cache";
import type { CompetitorReel } from "./scraper";

function reel(partial: Partial<CompetitorReel> & { id: string }): CompetitorReel {
  return {
    media_type: "REELS",
    caption: null,
    permalink: null,
    media_url: null,
    thumbnail_url: "https://p16-sign-va.tiktokcdn.com/cover.jpg?x-expires=1",
    posted_at: null,
    like_count: null,
    comments_count: null,
    view_count: null,
    duration_seconds: null,
    ...partial,
  };
}

function fakeStorage() {
  const uploads: { path: string; contentType?: string; upsert?: boolean }[] = [];
  const bucket: ThumbnailStorageBucket = {
    upload: vi.fn(async (path, _body, opts) => {
      uploads.push({ path, contentType: opts?.contentType, upsert: opts?.upsert });
      return { data: {}, error: null };
    }),
    getPublicUrl: (path: string) => ({
      data: {
        publicUrl: `https://store.test/storage/v1/object/public/competitor-thumbnails/${path}`,
      },
    }),
  };
  return { bucket, uploads };
}

function okFetch(): typeof fetch {
  return (async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })) as unknown as typeof fetch;
}

describe("competitorThumbnailPath", () => {
  it("namespaces by platform so ids never collide across platforms", () => {
    expect(competitorThumbnailPath("tiktok", "abc")).toBe("tiktok/abc.jpg");
  });
});

describe("cacheReelThumbnails", () => {
  it("rewrites TikTok thumbnails to the stable public bucket URL", async () => {
    const { bucket, uploads } = fakeStorage();
    const out = await cacheReelThumbnails({
      storage: bucket,
      platform: "tiktok",
      reels: [reel({ id: "v1" }), reel({ id: "v2" })],
      fetchImpl: okFetch(),
    });

    expect(out[0].thumbnail_url).toBe(
      "https://store.test/storage/v1/object/public/competitor-thumbnails/tiktok/v1.jpg",
    );
    expect(out[1].thumbnail_url).toBe(
      "https://store.test/storage/v1/object/public/competitor-thumbnails/tiktok/v2.jpg",
    );
    expect(uploads).toHaveLength(2);
    expect(uploads[0]).toEqual({
      path: "tiktok/v1.jpg",
      contentType: "image/jpeg",
      upsert: true,
    });
  });

  it("leaves non-TikTok platforms untouched and uploads nothing", async () => {
    const { bucket, uploads } = fakeStorage();
    const igReel = reel({
      id: "ig1",
      thumbnail_url: "https://scontent.cdninstagram.com/x.jpg",
    });
    const out = await cacheReelThumbnails({
      storage: bucket,
      platform: "instagram",
      reels: [igReel],
      fetchImpl: okFetch(),
    });
    expect(out[0].thumbnail_url).toBe("https://scontent.cdninstagram.com/x.jpg");
    expect(uploads).toHaveLength(0);
  });

  it("skips reels with no source thumbnail", async () => {
    const { bucket, uploads } = fakeStorage();
    const out = await cacheReelThumbnails({
      storage: bucket,
      platform: "tiktok",
      reels: [reel({ id: "v1", thumbnail_url: null })],
      fetchImpl: okFetch(),
    });
    expect(out[0].thumbnail_url).toBeNull();
    expect(uploads).toHaveLength(0);
  });

  it("keeps the source URL when the download fails (self-heals next sync)", async () => {
    const { bucket, uploads } = fakeStorage();
    const failingFetch = (async () =>
      new Response(null, { status: 403 })) as unknown as typeof fetch;
    const out = await cacheReelThumbnails({
      storage: bucket,
      platform: "tiktok",
      reels: [reel({ id: "v1", thumbnail_url: "https://tt/cover.jpg" })],
      fetchImpl: failingFetch,
    });
    expect(out[0].thumbnail_url).toBe("https://tt/cover.jpg");
    expect(uploads).toHaveLength(0);
  });

  it("does not throw when fetch itself rejects", async () => {
    const { bucket } = fakeStorage();
    const throwingFetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const out = await cacheReelThumbnails({
      storage: bucket,
      platform: "tiktok",
      reels: [reel({ id: "v1", thumbnail_url: "https://tt/cover.jpg" })],
      fetchImpl: throwingFetch,
    });
    expect(out[0].thumbnail_url).toBe("https://tt/cover.jpg");
  });
});
