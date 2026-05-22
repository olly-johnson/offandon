import { describe, expect, it } from "vitest";

import {
  computeOutliers,
  type OutlierFeedRow,
  type OutlierFeedOptions,
} from "./outlier-feed";

const COMPETITORS = [
  { id: "a", username: "channel_a" },
  { id: "b", username: "channel_b" },
];

function row(
  partial: Partial<OutlierFeedRow> & { id: string; competitor_id: string },
): OutlierFeedRow {
  return {
    caption: null,
    permalink: null,
    thumbnail_url: null,
    posted_at: "2026-05-01T00:00:00Z",
    view_count: 1000,
    like_count: null,
    comments_count: null,
    ...partial,
  };
}

function reels(channelId: string, viewCounts: number[]): OutlierFeedRow[] {
  return viewCounts.map((v, i) =>
    row({
      id: `${channelId}-${i}`,
      competitor_id: channelId,
      view_count: v,
    }),
  );
}

const FULL_OPTS: OutlierFeedOptions = {
  minOutlierRatio: 2,
  windowDays: 365,
  minSampleSize: 5,
  limit: 100,
  now: new Date("2026-05-22T00:00:00Z"),
};

describe("computeOutliers", () => {
  it("computes the outlier ratio against each channel's own median, not pooled", () => {
    const items = [
      // channel A: median = 1000. A's 5000 reel is 5x.
      ...reels("a", [500, 800, 1000, 1200, 5000]),
      // channel B: median = 100. B's 500 reel is 5x.
      ...reels("b", [50, 80, 100, 120, 500]),
    ];
    const out = computeOutliers(items, COMPETITORS, FULL_OPTS);
    // Both should appear; ratios computed per-channel.
    const a = out.find((x) => x.id === "a-4");
    const b = out.find((x) => x.id === "b-4");
    expect(a?.outlier_ratio).toBeCloseTo(5, 1);
    expect(b?.outlier_ratio).toBeCloseTo(5, 1);
  });

  it("excludes reels below the minOutlierRatio threshold", () => {
    const items = reels("a", [500, 800, 1000, 1200, 1900, 5000]);
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      minOutlierRatio: 2,
    });
    // median = 1100; threshold 2x = 2200; only the 5000 passes.
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a-5");
  });

  it("excludes competitors with fewer reels than minSampleSize", () => {
    const items = [
      ...reels("a", [100, 200, 300, 400, 500, 5000]), // sample = 6, included
      ...reels("b", [100, 999_999]), // sample = 2, excluded entirely
    ];
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      minSampleSize: 5,
    });
    expect(out.every((r) => r.competitor_id === "a")).toBe(true);
  });

  it("excludes reels with null or non-finite view_count", () => {
    const items = [
      row({ id: "a-0", competitor_id: "a", view_count: 100 }),
      row({ id: "a-1", competitor_id: "a", view_count: null }),
      row({
        id: "a-2",
        competitor_id: "a",
        view_count: Number.NaN as unknown as number,
      }),
      row({ id: "a-3", competitor_id: "a", view_count: 200 }),
      row({ id: "a-4", competitor_id: "a", view_count: 300 }),
      row({ id: "a-5", competitor_id: "a", view_count: 50_000 }),
    ];
    const out = computeOutliers(items, COMPETITORS, FULL_OPTS);
    // After filtering nulls/NaN sample is 4 (100, 200, 300, 50000)
    // -> below minSampleSize 5, so whole channel drops.
    expect(out).toHaveLength(0);
  });

  it("excludes reels posted before the windowDays cutoff", () => {
    const items = [
      ...reels("a", [100, 200, 300, 400, 500]),
      // Old viral reel from 2 years ago
      row({
        id: "a-ancient",
        competitor_id: "a",
        view_count: 1_000_000,
        posted_at: "2024-01-01T00:00:00Z",
      }),
    ];
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      windowDays: 90,
    });
    expect(out.find((r) => r.id === "a-ancient")).toBeUndefined();
  });

  it("includes the channel median in computation regardless of window cutoff", () => {
    // Channel's whole history establishes the baseline; window only
    // filters which reels are *eligible* to surface.
    const items = [
      // Old reels establish median 1000
      ...reels("a", [800, 900, 1000, 1100, 1200]).map((r) => ({
        ...r,
        posted_at: "2024-01-01T00:00:00Z",
      })),
      // Recent 5000-view reel: 5x the established median
      row({
        id: "a-recent",
        competitor_id: "a",
        view_count: 5000,
        posted_at: "2026-05-01T00:00:00Z",
      }),
    ];
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      windowDays: 90,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a-recent");
    // Median includes the recent reel itself: sorted (800,900,1000,
    // 1100,1200,5000), median = (1000+1100)/2 = 1050. So 5000/1050 ~ 4.76.
    // The window cutoff only filters what surfaces, not what feeds the median.
    expect(out[0].outlier_ratio).toBeCloseTo(4.76, 1);
  });

  it("sorts results by outlier_ratio descending", () => {
    const items = [
      ...reels("a", [100, 100, 100, 100, 100, 300, 1000]),
    ];
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      minOutlierRatio: 2,
    });
    expect(out.map((r) => r.id)).toEqual(["a-6", "a-5"]);
    expect(out[0].outlier_ratio).toBeGreaterThan(out[1].outlier_ratio);
  });

  it("respects the limit option", () => {
    const items = reels("a", [100, 100, 100, 100, 100, 200, 300, 400, 500]);
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      minOutlierRatio: 1.5,
      limit: 2,
    });
    expect(out).toHaveLength(2);
  });

  it("attaches the competitor username to every result", () => {
    const items = reels("a", [100, 100, 100, 100, 100, 500]);
    const out = computeOutliers(items, COMPETITORS, {
      ...FULL_OPTS,
      minOutlierRatio: 2,
    });
    expect(out[0].competitor_username).toBe("channel_a");
  });

  it("drops rows whose competitor isn't in the competitors list", () => {
    const items = reels("orphan", [100, 100, 100, 100, 100, 500]);
    const out = computeOutliers(items, COMPETITORS, FULL_OPTS);
    expect(out).toHaveLength(0);
  });
});
