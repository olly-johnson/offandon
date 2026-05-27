/**
 * Pure aggregation helpers for the brand dashboard.
 *
 * Each function takes a list of IG media rows (the minimal shape we
 * actually read) plus a `now` Date so tests can be deterministic.
 * Server code passes `new Date()` at the call site.
 */

import type { InstagramMediaType } from "@/engines/instagram/types";

export interface DashboardMediaRow {
  id: string;
  media_type: InstagramMediaType;
  caption: string | null;
  permalink: string | null;
  posted_at: string | null;
  like_count: number | null;
  comments_count: number | null;
  reach: number | null;
  plays: number | null;
  saved: number | null;
  shares: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function withinWindow(postedAt: string | null, now: Date, days: number): boolean {
  if (!postedAt) return false;
  const t = new Date(postedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= days * DAY_MS;
}

function toIsoDate(d: string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export interface EngagementSeriesPoint {
  date: string;
  engagement: number;
}

export function buildEngagementSeries(
  rows: DashboardMediaRow[],
  now: Date,
  days = 30,
): EngagementSeriesPoint[] {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!withinWindow(r.posted_at, now, days)) continue;
    if (!r.posted_at) continue;
    const day = toIsoDate(r.posted_at);
    const eng = (r.like_count ?? 0) + (r.comments_count ?? 0);
    buckets.set(day, (buckets.get(day) ?? 0) + eng);
  }
  return [...buckets.entries()]
    .map(([date, engagement]) => ({ date, engagement }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface FollowerHistoryPoint {
  captured_on: string;
  followers_count: number;
}

/**
 * New Followers over the window = last snapshot - first snapshot.
 * Returns null when fewer than 2 snapshots exist (one data point can't
 * yield a delta). Negative deltas are returned as-is so the UI can show
 * a -- sign instead of silently flooring to zero.
 */
export function computeNewFollowers(history: FollowerHistoryPoint[]): number | null {
  if (history.length < 2) return null;
  const first = history[0].followers_count;
  const last = history[history.length - 1].followers_count;
  return last - first;
}

export interface DashboardMetrics {
  followers: number | null;
  reach: number | null;
  newFollowers: number | null;
  engagement: number | null;
  engagementRate: number | null;
  videoViews: number | null;
  saves: number | null;
  shares: number | null;
}

/**
 * Aggregate scalar metrics over the trailing 30 days. Any field that
 * has zero contributing data points returns `null` rather than 0 so the
 * UI can render "N/A" instead of pretending the user has zero saves.
 */
export function computeAccountMetrics(
  rows: DashboardMediaRow[],
  opts: {
    followers: number | null;
    now: Date;
    days?: number;
    followerHistory?: FollowerHistoryPoint[];
  },
): DashboardMetrics {
  const days = opts.days ?? 30;
  const recent = rows.filter((r) => withinWindow(r.posted_at, opts.now, days));

  const sum = (pick: (r: DashboardMediaRow) => number | null): number | null => {
    let any = false;
    let total = 0;
    for (const r of recent) {
      const v = pick(r);
      if (v === null || v === undefined) continue;
      any = true;
      total += v;
    }
    return any ? total : null;
  };

  const likes = sum((r) => r.like_count);
  const comments = sum((r) => r.comments_count);
  const reach = sum((r) => r.reach);
  const videoViews = sum((r) => r.plays);
  const saves = sum((r) => r.saved);
  const shares = sum((r) => r.shares);

  // Engagement total uses likes + comments because saves/shares are
  // often nullable on older posts. Those still surface as their own
  // metric cells so power users can see the deeper signal.
  const engagement =
    likes === null && comments === null ? null : (likes ?? 0) + (comments ?? 0);

  const engagementRate =
    engagement !== null && reach !== null && reach > 0
      ? (engagement / reach) * 100
      : null;

  return {
    followers: opts.followers,
    reach,
    newFollowers: opts.followerHistory
      ? computeNewFollowers(opts.followerHistory)
      : null,
    engagement,
    engagementRate,
    videoViews,
    saves,
    shares,
  };
}

export interface TopContentRow {
  id: string;
  caption: string;
  permalink: string | null;
  postedAt: string | null;
  engagementRate: number | null;
  outlierMultiplier: number | null;
  views: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
}

function postEngagementRate(r: DashboardMediaRow): number | null {
  const num = (r.like_count ?? 0) + (r.comments_count ?? 0) + (r.saved ?? 0) + (r.shares ?? 0);
  const denom = r.plays ?? r.reach ?? 0;
  if (denom <= 0) return null;
  return (num / denom) * 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function buildTopContent(
  rows: DashboardMediaRow[],
  opts: { now: Date; limit?: number; days?: number },
): TopContentRow[] {
  const limit = opts.limit ?? 10;
  const days = opts.days ?? 30;
  const recent = rows.filter((r) => withinWindow(r.posted_at, opts.now, days));

  const rates = recent
    .map((r) => postEngagementRate(r))
    .filter((v): v is number => v !== null);
  const baseline = median(rates);

  return recent
    .map((r) => {
      const rate = postEngagementRate(r);
      const outlier = rate !== null && baseline > 0 ? rate / baseline : null;
      return {
        id: r.id,
        caption: (r.caption ?? "").trim() || "Untitled",
        permalink: r.permalink,
        postedAt: r.posted_at,
        engagementRate: rate,
        outlierMultiplier: outlier,
        views: r.plays,
        likes: r.like_count,
        saves: r.saved,
        shares: r.shares,
      };
    })
    .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1))
    .slice(0, limit);
}
