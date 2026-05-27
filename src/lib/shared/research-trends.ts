/**
 * Research Trends: "what's working right now" across the outlier reels of
 * every competitor the creator tracks, plus how it's shifting over time.
 *
 * Sibling to the Formula Matrix (src/lib/shared/formula-matrix.ts) but
 * time-aware. It answers, for a recent window:
 *   - which TOPICS are working   (the pillar each reel matched)
 *   - which HOOK TYPES are working (the analyzer's archetype classification)
 *   - which PLATFORMS are working  (instagram / tiktok / youtube_shorts)
 * each with a momentum delta versus the previous window, and emits a
 * monthly time-series so the UI can chart how the top topics move.
 *
 * Scoring mirrors the Formula Matrix: each row blends its reach percentile
 * (performance_score / 100) with its trending outlier ratio (view_count /
 * channel median, clamped at trendCap) into one 0..1 score. A row with
 * neither signal is dropped rather than dragging an average to zero.
 *
 * Pure + label-agnostic: the Supabase wiring lives in the trends-data loader.
 */

export type TrendPlatform = "instagram" | "tiktok" | "youtube_shorts";

export interface TrendInputRow {
  competitorUsername: string | null;
  platform: TrendPlatform;
  /** ISO timestamp the reel was posted. Rows without one are excluded from time logic. */
  postedAt: string | null;
  /** Matched pillar, used as the topic label. */
  topic: string | null;
  /** Analyzer hook archetype, or null when not yet classified. */
  hookType: string | null;
  hook: string | null;
  /** 0-100 reach percentile within the reel's own channel. */
  performanceScore: number | null;
  /** view_count / channel median; null when the channel has no baseline. */
  outlierRatio: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentsCount: number | null;
}

export type TrendDirection = "up" | "down" | "flat" | "new";

export interface TrendDimension {
  label: string;
  /** 0-100 blended score, averaged across this window's rows with this label. */
  score: number;
  sampleSize: number;
  /** Score-point delta versus the previous window. 0 when flat or no prior sample. */
  delta: number;
  direction: TrendDirection;
}

export interface TrendHook {
  hook: string;
  hookType: string | null;
  score: number;
  competitorUsername: string | null;
}

export interface TrendSeries {
  /** Sorted month bucket keys, e.g. "2026-01". */
  buckets: string[];
  /** Per-topic monthly average blended score (0-100); null where a topic had no posts that month. */
  topics: { label: string; points: Array<number | null> }[];
  /** Outlier count per month bucket, aligned to `buckets`. */
  volume: number[];
}

export interface ResearchTrends {
  windowDays: number;
  topics: TrendDimension[];
  hookTypes: TrendDimension[];
  platforms: TrendDimension[];
  topHooks: TrendHook[];
  headline: {
    outlierCount: number;
    avgOutlierRatio: number | null;
    avgEngagementRate: number | null;
    risingTopic: string | null;
  };
  series: TrendSeries;
  /** Rows in the current window that carried enough signal to score. */
  sampleSize: number;
}

export interface ResearchTrendsOptions {
  /** Ranking + headline window. Default 90 days. */
  windowDays?: number;
  /** How many months of history the chart spans. Default 6. */
  chartMonths?: number;
  /** Outlier ratio mapped to a full trend score of 1.0. Default 5x. */
  trendCap?: number;
  /** How many topics to chart. Default 3. */
  maxChartTopics?: number;
  /** How many hook exemplars to surface. Default 3. */
  maxHooks?: number;
  /** Injected for deterministic windowing in tests. */
  now?: Date;
}

const DAY_MS = 86_400_000;
const DEFAULTS = {
  windowDays: 90,
  chartMonths: 6,
  trendCap: 5,
  maxChartTopics: 3,
  maxHooks: 3,
};

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function scoreRow(row: TrendInputRow, trendCap: number): number | null {
  const parts: number[] = [];
  if (isFiniteNumber(row.performanceScore)) {
    parts.push(clamp01(row.performanceScore / 100));
  }
  if (isFiniteNumber(row.outlierRatio) && row.outlierRatio > 0 && trendCap > 0) {
    parts.push(clamp01(row.outlierRatio / trendCap));
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function monthKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface Scored {
  row: TrendInputRow;
  score: number;
  postedMs: number | null;
}

/** Average blended score per label over the supplied scored rows. */
function avgByLabel(
  scored: Scored[],
  pick: (r: TrendInputRow) => string | null,
): Map<string, { sum: number; count: number }> {
  const acc = new Map<string, { sum: number; count: number }>();
  for (const s of scored) {
    const label = pick(s.row);
    if (!label || label.trim() === "") continue;
    const e = acc.get(label) ?? { sum: 0, count: 0 };
    e.sum += s.score;
    e.count += 1;
    acc.set(label, e);
  }
  return acc;
}

function rankDimension(
  current: Scored[],
  previous: Scored[],
  pick: (r: TrendInputRow) => string | null,
): TrendDimension[] {
  const cur = avgByLabel(current, pick);
  const prev = avgByLabel(previous, pick);

  return [...cur.entries()]
    .map(([label, e]) => {
      const score = Math.round((e.sum / e.count) * 100);
      const p = prev.get(label);
      const prevScore = p ? Math.round((p.sum / p.count) * 100) : null;
      const delta = prevScore === null ? 0 : score - prevScore;
      const direction: TrendDirection =
        prevScore === null
          ? "new"
          : delta > 2
            ? "up"
            : delta < -2
              ? "down"
              : "flat";
      return { label, score, sampleSize: e.count, delta, direction };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.sampleSize - a.sampleSize ||
        a.label.localeCompare(b.label),
    );
}

function rankHooks(current: Scored[], maxHooks: number): TrendHook[] {
  const best = new Map<string, TrendHook>();
  for (const { row, score } of current) {
    const hook = row.hook?.trim();
    if (!hook) continue;
    const pct = Math.round(score * 100);
    const existing = best.get(hook);
    if (!existing || pct > existing.score) {
      best.set(hook, {
        hook,
        hookType: row.hookType,
        score: pct,
        competitorUsername: row.competitorUsername,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.hook.localeCompare(b.hook))
    .slice(0, maxHooks);
}

function buildSeries(
  scored: Scored[],
  topTopics: string[],
  chartMonths: number,
  now: Date,
): TrendSeries {
  // Build the trailing month buckets, oldest first, ending in `now`'s month.
  const buckets: string[] = [];
  for (let i = chartMonths - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const volume = new Array<number>(buckets.length).fill(0);
  // Per topic: running sum + count per bucket.
  const topicAcc = new Map<string, { sum: number[]; count: number[] }>();
  for (const t of topTopics) {
    topicAcc.set(t, {
      sum: new Array<number>(buckets.length).fill(0),
      count: new Array<number>(buckets.length).fill(0),
    });
  }

  for (const s of scored) {
    if (s.postedMs === null) continue;
    const key = monthKey(new Date(s.postedMs).toISOString());
    if (key === null) continue;
    const idx = bucketIndex.get(key);
    if (idx === undefined) continue;
    volume[idx] += 1;
    const topic = s.row.topic;
    if (topic && topicAcc.has(topic)) {
      const a = topicAcc.get(topic)!;
      a.sum[idx] += s.score;
      a.count[idx] += 1;
    }
  }

  const topics = topTopics.map((label) => {
    const a = topicAcc.get(label)!;
    const points = a.count.map((c, i) =>
      c === 0 ? null : Math.round((a.sum[i] / c) * 100),
    );
    return { label, points };
  });

  return { buckets, topics, volume };
}

function engagementRate(row: TrendInputRow): number | null {
  if (!isFiniteNumber(row.viewCount) || row.viewCount <= 0) return null;
  const likes = isFiniteNumber(row.likeCount) ? row.likeCount : 0;
  const comments = isFiniteNumber(row.commentsCount) ? row.commentsCount : 0;
  return (likes + comments) / row.viewCount;
}

export function buildResearchTrends(
  rows: TrendInputRow[],
  opts: ResearchTrendsOptions = {},
): ResearchTrends {
  const windowDays = opts.windowDays ?? DEFAULTS.windowDays;
  const chartMonths = opts.chartMonths ?? DEFAULTS.chartMonths;
  const trendCap = opts.trendCap ?? DEFAULTS.trendCap;
  const maxChartTopics = opts.maxChartTopics ?? DEFAULTS.maxChartTopics;
  const maxHooks = opts.maxHooks ?? DEFAULTS.maxHooks;
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const curStart = nowMs - windowDays * DAY_MS;
  const prevStart = nowMs - 2 * windowDays * DAY_MS;

  // Score every row once; keep its posted timestamp for windowing.
  const scoredAll: Scored[] = [];
  for (const row of rows) {
    const score = scoreRow(row, trendCap);
    if (score === null) continue;
    const postedMs = row.postedAt ? new Date(row.postedAt).getTime() : NaN;
    scoredAll.push({
      row,
      score,
      postedMs: Number.isNaN(postedMs) ? null : postedMs,
    });
  }

  // Rows with no postedAt still count toward "right now" rankings (we can't
  // place them on the timeline, but they're recent signal); rows with a
  // postedAt must fall inside the window.
  const inCurrent = (s: Scored) =>
    s.postedMs === null || s.postedMs >= curStart;
  const inPrevious = (s: Scored) =>
    s.postedMs !== null && s.postedMs >= prevStart && s.postedMs < curStart;

  const current = scoredAll.filter(inCurrent);
  const previous = scoredAll.filter(inPrevious);

  const topics = rankDimension(current, previous, (r) => r.topic);
  const hookTypes = rankDimension(current, previous, (r) => r.hookType);
  const platforms = rankDimension(current, previous, (r) => r.platform);
  const topHooks = rankHooks(current, maxHooks);

  // Headline metrics over the current window.
  const ratios = current
    .map((s) => s.row.outlierRatio)
    .filter((v): v is number => isFiniteNumber(v) && v > 0);
  const avgOutlierRatio =
    ratios.length > 0
      ? ratios.reduce((a, b) => a + b, 0) / ratios.length
      : null;
  const engagements = current
    .map((s) => engagementRate(s.row))
    .filter((v): v is number => v !== null);
  const avgEngagementRate =
    engagements.length > 0
      ? engagements.reduce((a, b) => a + b, 0) / engagements.length
      : null;
  const rising = topics
    .filter((t) => t.direction === "up")
    .sort((a, b) => b.delta - a.delta)[0];

  const series = buildSeries(
    scoredAll,
    topics.slice(0, maxChartTopics).map((t) => t.label),
    chartMonths,
    now,
  );

  return {
    windowDays,
    topics,
    hookTypes,
    platforms,
    topHooks,
    headline: {
      outlierCount: current.length,
      avgOutlierRatio,
      avgEngagementRate,
      risingTopic: rising ? rising.label : null,
    },
    series,
    sampleSize: current.length,
  };
}
