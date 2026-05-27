import "server-only";

import { listMediaForUser } from "@/engines/instagram/persistence";
import { getAnalysesForMediaIds } from "@/engines/research/persistence";
import { getAnalysesForCompetitorMediaIds } from "@/engines/competitor/analysis-persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import {
  buildFormulaMatrix,
  type FormulaInputRow,
  type FormulaMatrix,
} from "@/lib/shared/formula-matrix";

const log = createLogger("dashboard.formula-matrix");

/** Friendly format labels, matched to the Performance Breakdown card. */
const FORMAT_LABELS: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
  REELS: "Reel",
};

function formatLabel(mediaType: string): string {
  return FORMAT_LABELS[mediaType] ?? mediaType;
}

/** How many of the user's own library rows to consider. */
const OWN_MEDIA_LIMIT = 200;

/**
 * Gather every analysed video the user has signal on, from both their own
 * library and the competitors they track, normalise each into a
 * FormulaInputRow, and hand the lot to the pure matrix builder.
 *
 * The trending signal for competitor reels is view_count relative to that
 * competitor's own channel median (the same per-channel baseline the
 * outlier feed uses), so a small account's breakout still reads as
 * trending. Own rows carry no cross-channel ratio; they score on their
 * reach percentile alone.
 */
export async function loadFormulaMatrix(userId: string): Promise<FormulaMatrix> {
  const supabase = await createSupabaseServerClient();

  const rows: FormulaInputRow[] = [];

  // --- The creator's own analysed library ---
  const ownMedia = await listMediaForUser(supabase, userId, OWN_MEDIA_LIMIT);
  const ownAnalyses = await getAnalysesForMediaIds(
    supabase,
    ownMedia.map((m) => m.id),
  );
  for (const m of ownMedia) {
    const a = ownAnalyses.get(m.id);
    if (!a) continue;
    rows.push({
      source: "own",
      format: formatLabel(m.media_type),
      hook: a.hook,
      topic: a.pillar_match,
      performanceScore: a.performance_score,
      outlierRatio: null,
      viewCount: m.plays ?? m.reach ?? null,
      caption: m.caption,
      permalink: m.permalink,
      competitorUsername: null,
    });
  }

  // --- Tracked competitors' analysed reels ---
  const [{ data: competitors }, { data: competitorMedia }] = await Promise.all([
    supabase.from("competitor_accounts").select("id, username").eq("user_id", userId),
    supabase
      .from("competitor_media")
      .select("id, competitor_id, media_type, caption, permalink, view_count")
      .eq("user_id", userId),
  ]);

  const usernameById = new Map((competitors ?? []).map((c) => [c.id, c.username]));
  const medianByCompetitor = computeChannelMedians(competitorMedia ?? []);
  const competitorAnalyses = await getAnalysesForCompetitorMediaIds(
    supabase,
    (competitorMedia ?? []).map((m) => m.id),
  );
  for (const m of competitorMedia ?? []) {
    const a = competitorAnalyses.get(m.id);
    if (!a) continue;
    const median = medianByCompetitor.get(m.competitor_id) ?? 0;
    const outlierRatio =
      median > 0 && typeof m.view_count === "number" ? m.view_count / median : null;
    rows.push({
      source: "competitor",
      format: formatLabel(m.media_type),
      hook: a.hook,
      topic: a.pillar_match,
      performanceScore: a.performance_score,
      outlierRatio,
      viewCount: m.view_count,
      caption: m.caption,
      permalink: m.permalink,
      competitorUsername: usernameById.get(m.competitor_id) ?? null,
    });
  }

  const matrix = buildFormulaMatrix(rows);
  log.debug("formula matrix built", {
    user_id: userId,
    own_rows: ownMedia.length,
    competitor_rows: (competitorMedia ?? []).length,
    scored: matrix.sampleSize,
    has_formula: matrix.formula !== null,
  });
  return matrix;
}

/** Median view_count per competitor across their full scraped history. */
function computeChannelMedians(
  media: Array<{ competitor_id: string; view_count: number | null }>,
): Map<string, number> {
  const byCompetitor = new Map<string, number[]>();
  for (const m of media) {
    if (typeof m.view_count !== "number" || !Number.isFinite(m.view_count)) continue;
    let list = byCompetitor.get(m.competitor_id);
    if (!list) {
      list = [];
      byCompetitor.set(m.competitor_id, list);
    }
    list.push(m.view_count);
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
