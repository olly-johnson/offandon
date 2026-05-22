/**
 * Outlier feed: cross-competitor surface that floats the reels which
 * meaningfully outperformed their own channel's baseline. Powers
 * Step 2 on the Research page.
 *
 * Design notes:
 * - Outlier ratio = reel.view_count / channel_median(view_count). The
 *   comparison is ALWAYS per-channel so a 200K-view reel from a small
 *   account ranks above a 2M-view reel from MrBeast (200K is way over
 *   the small account's median; 2M is below MrBeast's).
 * - The full channel history establishes the median, not just the
 *   window. windowDays only filters which reels are eligible to
 *   *surface* in the feed, so a recent banger still gets compared to
 *   the channel's lifetime baseline rather than its last 90 days.
 * - Channels with fewer than minSampleSize reels are excluded
 *   entirely; the median is too noisy with <5 datapoints.
 * - Pure function `computeOutliers` is the testable core; the
 *   Supabase wrapper just shapes the query.
 */

import type { SuggestedPlatform } from "@/app/(app)/research/suggested-creators";
import { createLogger } from "@/lib/shared/logger";

import type { CompetitorSupabaseClient } from "./persistence";

export type OutlierFeedPlatform = SuggestedPlatform | "all";

const log = createLogger("competitor.outlier-feed");

export interface OutlierFeedRow {
  id: string;
  competitor_id: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comments_count: number | null;
}

export interface OutlierFeedCompetitor {
  id: string;
  username: string;
  /** Which platform this channel lives on. All current rows are 'instagram' until TT/YT tracking lands. */
  platform: SuggestedPlatform;
}

export interface OutlierFeedOptions {
  /** Minimum reel.view_count / channel_median ratio to surface. */
  minOutlierRatio: number;
  /** Drop reels posted before now - windowDays. Use a high value for "all time". */
  windowDays: number;
  /** Skip channels with fewer reels than this. Median is unstable below ~5. */
  minSampleSize: number;
  /** Cap how many results we return. */
  limit: number;
  /** Drop reels whose absolute view_count is below this. 0 disables. */
  minViews: number;
  /** Limit to a single platform or "all" for no filter. */
  platform: OutlierFeedPlatform;
  /** Injected for deterministic windowDays cutoffs in tests. */
  now?: Date;
}

export interface OutlierFeedItem {
  id: string;
  competitor_id: string;
  competitor_username: string;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  view_count: number;
  like_count: number | null;
  comments_count: number | null;
  /** view_count / channel_median. Floats; e.g. 5.2 means "5.2x the channel's median reach". */
  outlier_ratio: number;
}

export const DEFAULT_OUTLIER_FEED_OPTIONS: OutlierFeedOptions = {
  minOutlierRatio: 2,
  windowDays: 90,
  minSampleSize: 5,
  limit: 40,
  minViews: 0,
  platform: "all",
};

export function computeOutliers(
  rows: OutlierFeedRow[],
  competitors: OutlierFeedCompetitor[],
  opts: OutlierFeedOptions,
): OutlierFeedItem[] {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - opts.windowDays * 86_400_000);
  // Pre-filter the competitor set by the platform option so the
  // grouping loop never even sees off-platform channels. "all"
  // keeps everything.
  const eligible = competitors.filter(
    (c) => opts.platform === "all" || c.platform === opts.platform,
  );
  const usernameById = new Map(eligible.map((c) => [c.id, c.username]));

  // Group all reels per competitor (full history) to compute medians.
  const byCompetitor = new Map<string, OutlierFeedRow[]>();
  for (const r of rows) {
    if (!usernameById.has(r.competitor_id)) continue;
    if (!isFiniteNumber(r.view_count)) continue;
    let list = byCompetitor.get(r.competitor_id);
    if (!list) {
      list = [];
      byCompetitor.set(r.competitor_id, list);
    }
    list.push(r);
  }

  const out: OutlierFeedItem[] = [];
  for (const [competitorId, list] of byCompetitor) {
    if (list.length < opts.minSampleSize) continue;
    const views = list
      .map((r) => r.view_count)
      .filter(isFiniteNumber) as number[];
    const median = computeMedian(views);
    if (median <= 0) continue;

    for (const r of list) {
      if (!isFiniteNumber(r.view_count)) continue;
      if (r.view_count < opts.minViews) continue;
      if (r.posted_at && new Date(r.posted_at) < cutoff) continue;
      const ratio = r.view_count / median;
      if (ratio < opts.minOutlierRatio) continue;

      out.push({
        id: r.id,
        competitor_id: competitorId,
        competitor_username: usernameById.get(competitorId) ?? "",
        caption: r.caption,
        permalink: r.permalink,
        thumbnail_url: r.thumbnail_url,
        posted_at: r.posted_at,
        view_count: r.view_count,
        like_count: r.like_count,
        comments_count: r.comments_count,
        outlier_ratio: ratio,
      });
    }
  }

  out.sort((a, b) => b.outlier_ratio - a.outlier_ratio);
  return out.slice(0, opts.limit);
}

/**
 * Server-side wrapper: pulls every reel for the user's tracked
 * competitors (RLS enforces the user_id scope), joins competitor
 * usernames, then defers to computeOutliers for the math.
 */
export async function getOutlierFeed(
  supabase: CompetitorSupabaseClient,
  userId: string,
  opts: Partial<OutlierFeedOptions> = {},
): Promise<OutlierFeedItem[]> {
  const merged: OutlierFeedOptions = { ...DEFAULT_OUTLIER_FEED_OPTIONS, ...opts };

  const { data: competitors, error: cErr } = await supabase
    .from("competitor_accounts")
    .select("id, username")
    .eq("user_id", userId);
  if (cErr) {
    log.error("competitor_accounts fetch failed", { user_id: userId, message: cErr.message });
    throw new Error(`getOutlierFeed: ${cErr.message}`);
  }
  if (!competitors || competitors.length === 0) return [];
  // All tracked accounts are Instagram today. When the platform
  // column lands on competitor_accounts, drop the hardcode and read
  // c.platform from the row instead.
  const enriched: OutlierFeedCompetitor[] = competitors.map((c) => ({
    id: c.id as string,
    username: c.username as string,
    platform: "instagram",
  }));

  const { data: media, error: mErr } = await supabase
    .from("competitor_media")
    .select(
      "id, competitor_id, caption, permalink, thumbnail_url, posted_at, view_count, like_count, comments_count",
    )
    .eq("user_id", userId);
  if (mErr) {
    log.error("competitor_media fetch failed", { user_id: userId, message: mErr.message });
    throw new Error(`getOutlierFeed: ${mErr.message}`);
  }

  const items = computeOutliers(
    (media ?? []) as OutlierFeedRow[],
    enriched,
    merged,
  );
  log.debug("outlier feed computed", {
    user_id: userId,
    competitors: competitors.length,
    reels: media?.length ?? 0,
    outliers: items.length,
    minOutlierRatio: merged.minOutlierRatio,
    windowDays: merged.windowDays,
  });
  return items;
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
