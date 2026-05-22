import { describe, expect, it } from "vitest";

import {
  buildScrapeRequest,
  parseScrapeItem,
  type CompetitorReelInProgress,
} from "./platform-scraper";

const COMMON_ARGS = {
  resultsLimit: 30,
  webhookUrl: "https://app.example.com/api/apify/webhook",
  webhookSecret: "shh",
  runMetadata: { competitor_id: "c1", user_id: "u1" },
};

describe("buildScrapeRequest", () => {
  it("instagram: uses instagram-reel-scraper input shape", () => {
    const out = buildScrapeRequest({
      ...COMMON_ARGS,
      platform: "instagram",
      username: "hormozi",
    });
    expect(out.actorId).toContain("instagram-reel-scraper");
    expect(out.input).toEqual({ username: ["hormozi"], resultsLimit: 30 });
    expect(out.webhooks).toHaveLength(1);
  });

  it("tiktok: uses profiles[] input and the tiktok actor", () => {
    const out = buildScrapeRequest({
      ...COMMON_ARGS,
      platform: "tiktok",
      username: "garyvee",
    });
    expect(out.actorId).toContain("tiktok");
    expect(out.input).toMatchObject({
      profiles: ["garyvee"],
      resultsPerPage: 30,
    });
  });

  it("youtube: feeds the channel handle URL with /shorts suffix", () => {
    const out = buildScrapeRequest({
      ...COMMON_ARGS,
      platform: "youtube_shorts",
      username: "mkbhd",
    });
    expect(out.actorId).toContain("youtube");
    const input = out.input as { startUrls?: Array<{ url: string }> };
    expect(input.startUrls).toBeDefined();
    expect(input.startUrls?.[0].url).toContain("@mkbhd");
    expect(input.startUrls?.[0].url).toContain("/shorts");
  });

  it("encodes correlation IDs onto the webhook URL for all platforms", () => {
    for (const platform of ["instagram", "tiktok", "youtube_shorts"] as const) {
      const out = buildScrapeRequest({
        ...COMMON_ARGS,
        platform,
        username: "x",
      });
      const url = new URL(out.webhooks[0].requestUrl);
      expect(url.searchParams.get("competitor_id")).toBe("c1");
      expect(url.searchParams.get("user_id")).toBe("u1");
    }
  });
});

describe("parseScrapeItem", () => {
  it("instagram: parses shortCode + Video items (existing path)", () => {
    const out = parseScrapeItem("instagram", {
      shortCode: "Cabc123",
      type: "Video",
      caption: "hello",
      url: "https://www.instagram.com/p/Cabc123/",
      videoUrl: "https://video.example.com/x.mp4",
      displayUrl: "https://thumb.example.com/x.jpg",
      timestamp: "2026-05-01T00:00:00.000Z",
      likesCount: 1000,
      commentsCount: 50,
      videoPlayCount: 50_000,
      videoDuration: 12,
    });
    expect(out).not.toBeNull();
    expect(out?.id).toBe("Cabc123");
    expect(out?.view_count).toBe(50_000);
  });

  it("instagram: drops non-Video items", () => {
    const out = parseScrapeItem("instagram", {
      shortCode: "Cabc",
      type: "Image",
    });
    expect(out).toBeNull();
  });

  it("tiktok: parses authorized fields from clockworks~tiktok-scraper", () => {
    const out = parseScrapeItem("tiktok", {
      id: "7234567890",
      text: "Three lessons from running an agency",
      webVideoUrl: "https://www.tiktok.com/@x/video/7234567890",
      videoMeta: {
        coverUrl: "https://thumb.example.com/cover.jpg",
        duration: 30,
        downloadAddr: "https://video.example.com/x.mp4",
      },
      createTimeISO: "2026-05-01T00:00:00.000Z",
      playCount: 1_500_000,
      diggCount: 80_000,
      commentCount: 1_200,
    });
    expect(out?.id).toBe("7234567890");
    expect(out?.media_type).toBe("REELS");
    expect(out?.caption).toContain("Three lessons");
    expect(out?.thumbnail_url).toContain("cover.jpg");
    expect(out?.media_url).toContain("x.mp4");
    expect(out?.view_count).toBe(1_500_000);
    expect(out?.like_count).toBe(80_000);
    expect(out?.comments_count).toBe(1_200);
    expect(out?.duration_seconds).toBe(30);
  });

  it("tiktok: returns null when the id is missing", () => {
    const out = parseScrapeItem("tiktok", {
      text: "no id",
      playCount: 1000,
    });
    expect(out).toBeNull();
  });

  it("youtube_shorts: parses common youtube-scraper shape", () => {
    const out = parseScrapeItem("youtube_shorts", {
      id: "abc-XYZ",
      title: "Why ASML is the most important company",
      url: "https://www.youtube.com/shorts/abc-XYZ",
      thumbnailUrl: "https://i.ytimg.com/x.jpg",
      date: "2026-04-15T12:00:00.000Z",
      viewCount: 3_200_000,
      likes: 169_000,
      commentsCount: 1_600,
      duration: 58,
    });
    expect(out?.id).toBe("abc-XYZ");
    expect(out?.caption).toContain("ASML");
    expect(out?.permalink).toContain("/shorts/");
    expect(out?.view_count).toBe(3_200_000);
    expect(out?.like_count).toBe(169_000);
    expect(out?.duration_seconds).toBe(58);
  });

  it("youtube_shorts: tolerates videoId / publishedAt aliases", () => {
    const out = parseScrapeItem("youtube_shorts", {
      videoId: "xyz",
      title: "t",
      url: "https://www.youtube.com/shorts/xyz",
      publishedAt: "2026-04-01T00:00:00Z",
      views: 100,
    });
    expect(out?.id).toBe("xyz");
    expect(out?.view_count).toBe(100);
  });

  it("returns null for entirely empty rows on every platform", () => {
    expect(parseScrapeItem("instagram", null)).toBeNull();
    expect(parseScrapeItem("tiktok", {})).toBeNull();
    expect(parseScrapeItem("youtube_shorts", "garbage")).toBeNull();
  });

  it("typed return shape matches CompetitorReelInProgress", () => {
    // Compile-time only: the function must return CompetitorReel | null.
    const _typecheck: CompetitorReelInProgress | null = parseScrapeItem(
      "instagram",
      { shortCode: "x", type: "Video" },
    );
    expect(_typecheck).toBeTruthy();
  });
});
