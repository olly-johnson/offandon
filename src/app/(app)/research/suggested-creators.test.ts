import { describe, expect, it } from "vitest";

import {
  SUGGESTED_CREATORS,
  SUPPORTED_TRACKING_PLATFORMS,
  suggestedAvatarUrl,
  type SuggestedPlatform,
} from "./suggested-creators";

const HANDLE_RE = /^[a-z0-9._]{2,30}$/i;
const VALID_PLATFORMS: SuggestedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube_shorts",
];

describe("SUGGESTED_CREATORS", () => {
  it("has at least 6 entries so the visual grid fills out", () => {
    expect(SUGGESTED_CREATORS.length).toBeGreaterThanOrEqual(6);
  });

  it("uses platform-valid handles (no @ prefix, allowed chars only)", () => {
    for (const c of SUGGESTED_CREATORS) {
      expect(c.handle).toMatch(HANDLE_RE);
      expect(c.handle.startsWith("@")).toBe(false);
    }
  });

  it("has no duplicate (platform, handle) pairs", () => {
    const keys = SUGGESTED_CREATORS.map(
      (c) => `${c.platform}:${c.handle.toLowerCase()}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("attaches a positive follower_count to every entry", () => {
    for (const c of SUGGESTED_CREATORS) {
      expect(c.follower_count).toBeGreaterThan(0);
      expect(Number.isFinite(c.follower_count)).toBe(true);
    }
  });

  it("tags every entry with one of the three supported platforms", () => {
    for (const c of SUGGESTED_CREATORS) {
      expect(VALID_PLATFORMS).toContain(c.platform);
    }
  });

  it("mixes all three platforms in the curated list", () => {
    const platforms = new Set(SUGGESTED_CREATORS.map((c) => c.platform));
    expect(platforms.has("instagram")).toBe(true);
    expect(platforms.has("tiktok")).toBe(true);
    expect(platforms.has("youtube_shorts")).toBe(true);
  });
});

describe("SUPPORTED_TRACKING_PLATFORMS", () => {
  it("lists all three platforms now that TT + YT scrapers are wired", () => {
    expect(SUPPORTED_TRACKING_PLATFORMS.has("instagram")).toBe(true);
    expect(SUPPORTED_TRACKING_PLATFORMS.has("tiktok")).toBe(true);
    expect(SUPPORTED_TRACKING_PLATFORMS.has("youtube_shorts")).toBe(true);
  });
});

describe("suggestedAvatarUrl", () => {
  it("returns a Supabase Storage URL when the env var is set", () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    try {
      const url = suggestedAvatarUrl("alexHormozi");
      expect(url).toBe(
        "https://test.supabase.co/storage/v1/object/public/suggested-avatars/alexhormozi.webp",
      );
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    }
  });

  it("returns null when the Supabase URL env var is missing", () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    try {
      expect(suggestedAvatarUrl("any")).toBeNull();
    } finally {
      if (originalUrl !== undefined) {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      }
    }
  });
});
