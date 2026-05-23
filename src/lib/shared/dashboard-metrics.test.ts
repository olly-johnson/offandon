import { describe, expect, it } from "vitest";

import {
  buildEngagementSeries,
  buildTopContent,
  computeAccountMetrics,
  type DashboardMediaRow,
} from "./dashboard-metrics";

function media(
  partial: Partial<DashboardMediaRow> & Pick<DashboardMediaRow, "id" | "posted_at">,
): DashboardMediaRow {
  return {
    id: partial.id,
    media_type: partial.media_type ?? "REELS",
    caption: partial.caption ?? null,
    permalink: partial.permalink ?? null,
    posted_at: partial.posted_at,
    like_count: partial.like_count ?? null,
    comments_count: partial.comments_count ?? null,
    reach: partial.reach ?? null,
    plays: partial.plays ?? null,
    saved: partial.saved ?? null,
    shares: partial.shares ?? null,
  };
}

describe("buildEngagementSeries", () => {
  const now = new Date("2026-03-30T12:00:00Z");

  it("returns one point per posting day with engagement = likes + comments", () => {
    const rows = [
      media({ id: "a", posted_at: "2026-03-29T10:00:00Z", like_count: 100, comments_count: 5 }),
      media({ id: "b", posted_at: "2026-03-28T10:00:00Z", like_count: 50, comments_count: 2 }),
    ];
    const series = buildEngagementSeries(rows, now, 30);
    expect(series).toEqual([
      { date: "2026-03-28", engagement: 52 },
      { date: "2026-03-29", engagement: 105 },
    ]);
  });

  it("sums multiple posts on the same day", () => {
    const rows = [
      media({ id: "a", posted_at: "2026-03-20T08:00:00Z", like_count: 10, comments_count: 1 }),
      media({ id: "b", posted_at: "2026-03-20T20:00:00Z", like_count: 5, comments_count: 0 }),
    ];
    const series = buildEngagementSeries(rows, now, 30);
    expect(series).toEqual([{ date: "2026-03-20", engagement: 16 }]);
  });

  it("excludes posts outside the window", () => {
    const rows = [
      media({ id: "old", posted_at: "2025-12-01T00:00:00Z", like_count: 999, comments_count: 99 }),
      media({ id: "new", posted_at: "2026-03-29T10:00:00Z", like_count: 1, comments_count: 0 }),
    ];
    const series = buildEngagementSeries(rows, now, 30);
    expect(series).toEqual([{ date: "2026-03-29", engagement: 1 }]);
  });

  it("treats null counts as zero", () => {
    const rows = [
      media({ id: "a", posted_at: "2026-03-29T10:00:00Z", like_count: null, comments_count: 3 }),
    ];
    expect(buildEngagementSeries(rows, now, 30)).toEqual([
      { date: "2026-03-29", engagement: 3 },
    ]);
  });

  it("returns empty array when no posts are in the window", () => {
    expect(buildEngagementSeries([], now, 30)).toEqual([]);
  });
});

describe("computeAccountMetrics", () => {
  const now = new Date("2026-03-30T12:00:00Z");

  it("sums reach, engagement, video views, saves, shares over the 30d window", () => {
    const rows = [
      media({
        id: "a",
        posted_at: "2026-03-29T10:00:00Z",
        like_count: 100,
        comments_count: 10,
        reach: 1000,
        plays: 5000,
        saved: 20,
        shares: 5,
      }),
      media({
        id: "b",
        posted_at: "2026-03-15T10:00:00Z",
        like_count: 50,
        comments_count: 5,
        reach: 500,
        plays: 2000,
        saved: 10,
        shares: 2,
      }),
    ];
    const m = computeAccountMetrics(rows, { followers: 10_000, now });
    expect(m.followers).toBe(10_000);
    expect(m.reach).toBe(1500);
    expect(m.engagement).toBe(165);
    expect(m.videoViews).toBe(7000);
    expect(m.saves).toBe(30);
    expect(m.shares).toBe(7);
  });

  it("returns null for metrics with no data, not zero", () => {
    const rows = [
      media({ id: "a", posted_at: "2026-03-29T10:00:00Z", like_count: null, comments_count: null }),
    ];
    const m = computeAccountMetrics(rows, { followers: null, now });
    expect(m.followers).toBeNull();
    expect(m.reach).toBeNull();
    expect(m.engagement).toBeNull();
    expect(m.videoViews).toBeNull();
    expect(m.saves).toBeNull();
    expect(m.shares).toBeNull();
    expect(m.engagementRate).toBeNull();
  });

  it("computes engagement rate as engagement / reach", () => {
    const rows = [
      media({
        id: "a",
        posted_at: "2026-03-29T10:00:00Z",
        like_count: 70,
        comments_count: 0,
        reach: 1000,
      }),
    ];
    const m = computeAccountMetrics(rows, { followers: 5000, now });
    expect(m.engagementRate).toBeCloseTo(7, 1);
  });

  it("excludes posts outside the 30d window from sums", () => {
    const rows = [
      media({
        id: "old",
        posted_at: "2025-11-01T00:00:00Z",
        like_count: 9999,
        reach: 9999,
        plays: 9999,
        saved: 9999,
        shares: 9999,
      }),
    ];
    const m = computeAccountMetrics(rows, { followers: 0, now });
    expect(m.engagement).toBeNull();
    expect(m.reach).toBeNull();
  });
});

describe("buildTopContent", () => {
  const now = new Date("2026-03-30T12:00:00Z");

  it("ranks posts by engagement rate, descending", () => {
    const rows = [
      media({
        id: "low",
        posted_at: "2026-03-20T00:00:00Z",
        like_count: 10,
        plays: 1000,
        reach: 1000,
      }),
      media({
        id: "high",
        posted_at: "2026-03-21T00:00:00Z",
        like_count: 100,
        plays: 1000,
        reach: 1000,
      }),
    ];
    const top = buildTopContent(rows, { now, limit: 10 });
    expect(top[0].id).toBe("high");
    expect(top[1].id).toBe("low");
  });

  it("computes outlier multiplier vs the median engagement rate", () => {
    const rows = [
      media({ id: "a", posted_at: "2026-03-20T00:00:00Z", like_count: 10, plays: 1000 }),
      media({ id: "b", posted_at: "2026-03-21T00:00:00Z", like_count: 10, plays: 1000 }),
      media({ id: "c", posted_at: "2026-03-22T00:00:00Z", like_count: 100, plays: 1000 }),
    ];
    const top = buildTopContent(rows, { now, limit: 10 });
    const outlier = top.find((r) => r.id === "c");
    expect(outlier?.outlierMultiplier).toBeCloseTo(10, 1);
  });

  it("respects the limit and the 30d window", () => {
    const rows = [
      media({ id: "old", posted_at: "2024-01-01T00:00:00Z", like_count: 99999, plays: 1000 }),
      media({ id: "a", posted_at: "2026-03-20T00:00:00Z", like_count: 1, plays: 100 }),
      media({ id: "b", posted_at: "2026-03-21T00:00:00Z", like_count: 1, plays: 100 }),
      media({ id: "c", posted_at: "2026-03-22T00:00:00Z", like_count: 1, plays: 100 }),
    ];
    const top = buildTopContent(rows, { now, limit: 2 });
    expect(top).toHaveLength(2);
    expect(top.every((r) => r.id !== "old")).toBe(true);
  });
});
