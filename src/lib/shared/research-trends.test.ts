import { describe, expect, it } from "vitest";

import {
  buildResearchTrends,
  type TrendInputRow,
  type TrendPlatform,
} from "./research-trends";

const NOW = new Date("2026-06-15T00:00:00.000Z");

function row(p: Partial<TrendInputRow> & { postedAt: string | null }): TrendInputRow {
  return {
    competitorUsername: "garyvee",
    platform: "tiktok" as TrendPlatform,
    topic: "Operator Frameworks",
    hookType: "CURIOSITY",
    hook: "Three things broke me.",
    performanceScore: 80,
    outlierRatio: 2,
    viewCount: 100_000,
    likeCount: 5_000,
    commentsCount: 1_000,
    ...p,
  };
}

// Days relative to NOW.
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe("buildResearchTrends", () => {
  it("drops rows that carry neither reach nor outlier signal", () => {
    const t = buildResearchTrends(
      [row({ postedAt: daysAgo(5), performanceScore: null, outlierRatio: null })],
      { now: NOW },
    );
    expect(t.sampleSize).toBe(0);
    expect(t.topics).toHaveLength(0);
  });

  it("ranks topics by blended score within the current window", () => {
    const rows = [
      row({ postedAt: daysAgo(10), topic: "A", performanceScore: 90, outlierRatio: 5 }),
      row({ postedAt: daysAgo(20), topic: "B", performanceScore: 20, outlierRatio: 1 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW });
    expect(t.topics[0].label).toBe("A");
    expect(t.topics[0].score).toBeGreaterThan(t.topics[1].score);
  });

  it("excludes reels posted before the window from the ranking", () => {
    const rows = [
      row({ postedAt: daysAgo(10), topic: "Recent" }),
      row({ postedAt: daysAgo(200), topic: "Ancient" }),
    ];
    const t = buildResearchTrends(rows, { now: NOW, windowDays: 90 });
    expect(t.topics.map((x) => x.label)).toEqual(["Recent"]);
  });

  it("counts rows with no postedAt as current-window signal", () => {
    const t = buildResearchTrends([row({ postedAt: null, topic: "Undated" })], {
      now: NOW,
    });
    expect(t.topics.map((x) => x.label)).toEqual(["Undated"]);
  });

  it("computes a momentum delta versus the previous window", () => {
    const rows = [
      // previous window (~120d ago): low score
      row({ postedAt: daysAgo(120), topic: "A", performanceScore: 40, outlierRatio: 1 }),
      // current window: high score
      row({ postedAt: daysAgo(10), topic: "A", performanceScore: 90, outlierRatio: 5 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW, windowDays: 90 });
    const a = t.topics.find((x) => x.label === "A")!;
    expect(a.direction).toBe("up");
    expect(a.delta).toBeGreaterThan(0);
  });

  it("marks a topic with no prior-window sample as new", () => {
    const t = buildResearchTrends([row({ postedAt: daysAgo(5), topic: "Fresh" })], {
      now: NOW,
    });
    expect(t.topics[0].direction).toBe("new");
    expect(t.topics[0].delta).toBe(0);
  });

  it("ranks hook types and ignores null hook types", () => {
    const rows = [
      row({ postedAt: daysAgo(5), hookType: "PROOF", performanceScore: 95 }),
      row({ postedAt: daysAgo(6), hookType: null, performanceScore: 95 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW });
    expect(t.hookTypes.map((h) => h.label)).toEqual(["PROOF"]);
  });

  it("ranks platforms", () => {
    const rows = [
      row({ postedAt: daysAgo(5), platform: "tiktok", performanceScore: 95 }),
      row({ postedAt: daysAgo(6), platform: "instagram", performanceScore: 30 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW });
    expect(t.platforms[0].label).toBe("tiktok");
  });

  it("surfaces top hooks with their type, dedups verbatim, caps to maxHooks", () => {
    const rows = [
      row({ postedAt: daysAgo(5), hook: "Hook one", performanceScore: 90 }),
      row({ postedAt: daysAgo(6), hook: "Hook one", performanceScore: 50 }),
      row({ postedAt: daysAgo(7), hook: "Hook two", performanceScore: 80 }),
      row({ postedAt: daysAgo(8), hook: "Hook three", performanceScore: 70 }),
      row({ postedAt: daysAgo(9), hook: "Hook four", performanceScore: 60 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW, maxHooks: 3 });
    expect(t.topHooks).toHaveLength(3);
    expect(t.topHooks[0].hook).toBe("Hook one");
    expect(t.topHooks[0].hookType).toBe("CURIOSITY");
  });

  it("computes headline metrics over the window", () => {
    const rows = [
      row({
        postedAt: daysAgo(5),
        outlierRatio: 4,
        viewCount: 1000,
        likeCount: 80,
        commentsCount: 20,
      }),
      row({
        postedAt: daysAgo(6),
        outlierRatio: 2,
        viewCount: 1000,
        likeCount: 40,
        commentsCount: 10,
      }),
    ];
    const t = buildResearchTrends(rows, { now: NOW });
    expect(t.headline.outlierCount).toBe(2);
    expect(t.headline.avgOutlierRatio).toBeCloseTo(3, 5);
    // (0.10 + 0.05) / 2 = 0.075
    expect(t.headline.avgEngagementRate).toBeCloseTo(0.075, 5);
  });

  it("names the fastest-rising topic", () => {
    const rows = [
      row({ postedAt: daysAgo(120), topic: "Climber", performanceScore: 30, outlierRatio: 1 }),
      row({ postedAt: daysAgo(5), topic: "Climber", performanceScore: 95, outlierRatio: 5 }),
      row({ postedAt: daysAgo(7), topic: "Steady", performanceScore: 60, outlierRatio: 2 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW });
    expect(t.headline.risingTopic).toBe("Climber");
  });

  it("emits a monthly series for the top topics with aligned volume", () => {
    const rows = [
      row({ postedAt: "2026-04-10T00:00:00Z", topic: "A", performanceScore: 80 }),
      row({ postedAt: "2026-05-10T00:00:00Z", topic: "A", performanceScore: 90 }),
      row({ postedAt: "2026-06-10T00:00:00Z", topic: "A", performanceScore: 70 }),
    ];
    const t = buildResearchTrends(rows, { now: NOW, chartMonths: 6, maxChartTopics: 3 });
    expect(t.series.buckets).toHaveLength(6);
    expect(t.series.buckets[t.series.buckets.length - 1]).toBe("2026-06");
    expect(t.series.buckets).toContain("2026-04");
    const a = t.series.topics.find((s) => s.label === "A")!;
    // April / May / June buckets have a point; January has none.
    const aprIdx = t.series.buckets.indexOf("2026-04");
    const janIdx = t.series.buckets.indexOf("2026-01");
    expect(a.points[aprIdx]).not.toBeNull();
    expect(a.points[janIdx]).toBeNull();
    expect(t.series.volume[aprIdx]).toBe(1);
  });
});
