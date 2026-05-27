import { describe, expect, it, vi } from "vitest";

import type { SuggestedCreator } from "@/app/(app)/research/suggested-creators";

import {
  cacheSuggestedAvatar,
  type AvatarStorageBucket,
  type AvatarUrlSource,
} from "./suggested-avatar-cache";

function creator(partial: Partial<SuggestedCreator> = {}): SuggestedCreator {
  return {
    handle: "GaryVee",
    platform: "tiktok",
    follower_count: 1,
    ...partial,
  };
}

function fakeSource(url: string | null): AvatarUrlSource {
  return { fetchAvatarUrl: vi.fn(async () => url) };
}

function fakeStorage() {
  const uploads: { path: string; contentType?: string; upsert?: boolean }[] = [];
  const storage: AvatarStorageBucket = {
    upload: vi.fn(async (path, _body, opts) => {
      uploads.push({ path, contentType: opts?.contentType, upsert: opts?.upsert });
      return { data: {}, error: null };
    }),
  };
  return { storage, uploads };
}

function okFetch(): typeof fetch {
  return (async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    })) as unknown as typeof fetch;
}

describe("cacheSuggestedAvatar", () => {
  it("downloads the avatar and uploads it under <handle>.webp", async () => {
    const { storage, uploads } = fakeStorage();
    const source = fakeSource("https://tt/avatar.jpg");
    const outcome = await cacheSuggestedAvatar({
      creator: creator(),
      scraper: source,
      storage,
      fetchImpl: okFetch(),
    });

    expect(outcome).toBe("uploaded");
    expect(source.fetchAvatarUrl).toHaveBeenCalledWith("tiktok", "GaryVee");
    expect(uploads).toEqual([
      { path: "garyvee.webp", contentType: "image/jpeg", upsert: true },
    ]);
  });

  it("returns 'missing' and uploads nothing when no avatar url is found", async () => {
    const { storage, uploads } = fakeStorage();
    const outcome = await cacheSuggestedAvatar({
      creator: creator(),
      scraper: fakeSource(null),
      storage,
      fetchImpl: okFetch(),
    });
    expect(outcome).toBe("missing");
    expect(uploads).toHaveLength(0);
  });

  it("returns 'failed' when the avatar download is non-2xx", async () => {
    const { storage } = fakeStorage();
    const failing = (async () =>
      new Response(null, { status: 403 })) as unknown as typeof fetch;
    const outcome = await cacheSuggestedAvatar({
      creator: creator(),
      scraper: fakeSource("https://tt/avatar.jpg"),
      storage,
      fetchImpl: failing,
    });
    expect(outcome).toBe("failed");
  });

  it("returns 'failed' when the upload errors", async () => {
    const storage: AvatarStorageBucket = {
      upload: vi.fn(async () => ({ data: null, error: { message: "denied" } })),
    };
    const outcome = await cacheSuggestedAvatar({
      creator: creator(),
      scraper: fakeSource("https://tt/avatar.jpg"),
      storage,
      fetchImpl: okFetch(),
    });
    expect(outcome).toBe("failed");
  });

  it("returns 'failed' when the source throws instead of bubbling", async () => {
    const { storage } = fakeStorage();
    const throwing: AvatarUrlSource = {
      fetchAvatarUrl: vi.fn(async () => {
        throw new Error("apify down");
      }),
    };
    const outcome = await cacheSuggestedAvatar({
      creator: creator(),
      scraper: throwing,
      storage,
      fetchImpl: okFetch(),
    });
    expect(outcome).toBe("failed");
  });
});
