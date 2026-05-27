import "server-only";

import { getAnalysesForCompetitorMediaIds } from "@/engines/competitor/analysis-persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import {
  buildResearchTrends,
  type ResearchTrends,
  type TrendInputRow,
  type TrendPlatform,
} from "@/lib/shared/research-trends";

const log = createLogger("research.trends");

/**
 * Build the "what's working now" trends across every outlier reel of the
 * competitors the user tracks. The trending signal is view_count relative
 * to that competitor's own channel median (the same per-channel baseline
 * the outlier feed + Formula Matrix use), blended with each reel's reach
 * percentile. Returns an empty-but-valid trends object when the user has
 * no analysed competitor reels yet.
 */
export async function loadResearchTrends(userId: string): Promise<ResearchTrends> {
  const supabase = await createSupabaseServerClient();

  const [{ data: competitors }, { data: media }] = await Promise.all([
    supabase
      .from("competitor_accounts")
      .select("id, username, platform")
      .eq("user_id", userId),
    supabase
      .from("competitor_media")
      .select(
        "id, competitor_id, posted_at, view_count, like_count, comments_count",
      )
      .eq("user_id", userId),
  ]);

  const competitorList = competitors ?? [];
  const mediaList = media ?? [];

  const metaById = new Map(
    competitorList.map((c) => [
      c.id as string,
      {
        username: c.username as string,
        platform: (c.platform ?? "instagram") as TrendPlatform,
      },
    ]),
  );
  const medianByCompetitor = computeChannelMedians(mediaList);

  const analyses = await getAnalysesForCompetitorMediaIds(
    supabase,
    mediaList.map((m) => m.id as string),
  );

  const rows: TrendInputRow[] = [];
  for (const m of mediaList) {
    const a = analyses.get(m.id as string);
    if (!a) continue;
    const meta = metaById.get(m.competitor_id as string);
    const median = medianByCompetitor.get(m.competitor_id as string) ?? 0;
    const viewCount = typeof m.view_count === "number" ? m.view_count : null;
    const outlierRatio =
      median > 0 && viewCount !== null ? viewCount / median : null;
    rows.push({
      competitorUsername: meta?.username ?? null,
      platform: meta?.platform ?? "instagram",
      postedAt: (m.posted_at as string | null) ?? null,
      topic: a.pillar_match,
      hookType: a.hook_type,
      hook: a.hook,
      performanceScore: a.performance_score,
      outlierRatio,
      viewCount,
      likeCount: typeof m.like_count === "number" ? m.like_count : null,
      commentsCount: typeof m.comments_count === "number" ? m.comments_count : null,
    });
  }

  const trends = buildResearchTrends(rows);
  log.debug("research trends built", {
    user_id: userId,
    competitors: competitorList.length,
    media: mediaList.length,
    analysed_rows: rows.length,
    scored: trends.sampleSize,
  });
  return trends;
}

function computeChannelMedians(
  media: Array<{ competitor_id: string; view_count: number | null }>,
): Map<string, number> {
  const byCompetitor = new Map<string, number[]>();
  for (const m of media) {
    if (typeof m.view_count !== "number" || !Number.isFinite(m.view_count)) continue;
    const list = byCompetitor.get(m.competitor_id) ?? [];
    list.push(m.view_count);
    byCompetitor.set(m.competitor_id, list);
  }
  const out = new Map<string, number>();
  for (const [id, views] of byCompetitor) {
    out.set(id, median(views));
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
