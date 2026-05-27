/**
 * The Formula Matrix: the analyst surface's unique IP.
 *
 * It reads every analysed short-form video the creator has signal on,
 * both their own library (instagram_media_analysis) and the reels of the
 * competitors they track (competitor_media_analysis), and answers three
 * questions independently:
 *
 *   - which FORMAT is working   (Reel / Carousel / ...)
 *   - which TOPIC is working    (the pillar each analysis matched)
 *   - which HOOK is working      (surfaced as verbatim exemplars)
 *
 * It then combines the winner of each dimension into one suggested video
 * formula: "shoot a <format> about <topic>, open with a hook like this".
 * The combo that wins is not always the one the creator believes wins,
 * which is the whole point of converting gut feeling into data.
 *
 * Two signals drive the ranking, blended per row into a 0..1 score:
 *   - reach percentile (performance_score): how far above the rest of its
 *     own channel a video reached. This is the "ourselves vs themselves"
 *     baseline that lets a small account's banger beat a big account's dud.
 *   - trending outlier ratio (competitor view_count / channel median):
 *     how far a competitor reel beat its own channel. Own rows have no
 *     cross-channel ratio, so they score on reach percentile alone.
 *
 * This module is pure and label-agnostic: callers pass already-friendly
 * format/topic strings and the verbatim hook. The Supabase wiring lives
 * in the dashboard's formula-matrix-data loader.
 */

export type FormulaSource = "own" | "competitor";

export interface FormulaInputRow {
  source: FormulaSource;
  /** Friendly format label, e.g. "Reel", "Carousel". Opaque to this module. */
  format: string;
  /** Verbatim hook text, or null if the analysis could not read one. */
  hook: string | null;
  /** Topic label (the matched pillar), or null if no pillar fit. */
  topic: string | null;
  /** 0-100 reach percentile within the video's own channel, or null. */
  performanceScore: number | null;
  /** view_count / channel median for competitor reels; null for own rows. */
  outlierRatio: number | null;
  viewCount: number | null;
  caption: string | null;
  permalink: string | null;
  /** Set for competitor rows so the UI can attribute an exemplar hook. */
  competitorUsername: string | null;
}

export interface FormulaDimension {
  label: string;
  /** 0-100 blended score, averaged across the rows with this label. */
  score: number;
  /** How many scoreable rows backed this label. */
  sampleSize: number;
  /** Which sources (own / competitor) contributed, sorted + deduped. */
  sources: FormulaSource[];
}

export interface HookExemplar {
  hook: string;
  score: number;
  source: FormulaSource;
  competitorUsername: string | null;
  permalink: string | null;
}

export interface SuggestedFormula {
  format: string;
  topic: string;
  hook: string;
  rationale: string;
}

export interface FormulaMatrix {
  formats: FormulaDimension[];
  topics: FormulaDimension[];
  hooks: HookExemplar[];
  formula: SuggestedFormula | null;
  /** Number of rows that carried enough signal to score. */
  sampleSize: number;
}

export interface FormulaMatrixOptions {
  /**
   * Outlier ratio that maps to a full trend score of 1.0. A reel at
   * trendCap times its channel median (default 5x) is treated as
   * maximally trending; anything beyond is clamped.
   */
  trendCap?: number;
  /** How many hook exemplars to surface. */
  maxHooks?: number;
}

const DEFAULT_TREND_CAP = 5;
const DEFAULT_MAX_HOOKS = 3;

interface ScoredRow {
  row: FormulaInputRow;
  score: number; // 0..1
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Blend the reach percentile and the trending outlier ratio into a single
 * 0..1 score. Returns null when a row carries neither signal, so it falls
 * out of every average instead of dragging it toward zero.
 */
function scoreRow(row: FormulaInputRow, trendCap: number): number | null {
  const components: number[] = [];
  if (isFiniteNumber(row.performanceScore)) {
    components.push(clamp01(row.performanceScore / 100));
  }
  if (isFiniteNumber(row.outlierRatio) && row.outlierRatio > 0 && trendCap > 0) {
    components.push(clamp01(row.outlierRatio / trendCap));
  }
  if (components.length === 0) return null;
  return components.reduce((a, b) => a + b, 0) / components.length;
}

interface DimensionAccumulator {
  sum: number;
  count: number;
  sources: Set<FormulaSource>;
}

function rankDimension(
  scored: ScoredRow[],
  pick: (row: FormulaInputRow) => string | null,
): FormulaDimension[] {
  const acc = new Map<string, DimensionAccumulator>();
  for (const { row, score } of scored) {
    const label = pick(row);
    if (label === null || label.trim() === "") continue;
    let entry = acc.get(label);
    if (!entry) {
      entry = { sum: 0, count: 0, sources: new Set() };
      acc.set(label, entry);
    }
    entry.sum += score;
    entry.count += 1;
    entry.sources.add(row.source);
  }

  return [...acc.entries()]
    .map(([label, e]) => ({
      label,
      score: Math.round((e.sum / e.count) * 100),
      sampleSize: e.count,
      sources: [...e.sources].sort(),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.sampleSize - a.sampleSize ||
        a.label.localeCompare(b.label),
    );
}

function rankHooks(scored: ScoredRow[], maxHooks: number): HookExemplar[] {
  // Keep the single best-scoring instance of each verbatim hook.
  const best = new Map<string, HookExemplar>();
  for (const { row, score } of scored) {
    const hook = row.hook?.trim();
    if (!hook) continue;
    const pct = Math.round(score * 100);
    const existing = best.get(hook);
    if (!existing || pct > existing.score) {
      best.set(hook, {
        hook,
        score: pct,
        source: row.source,
        competitorUsername: row.competitorUsername,
        permalink: row.permalink,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.hook.localeCompare(b.hook))
    .slice(0, maxHooks);
}

function buildRationale(
  format: FormulaDimension,
  topic: FormulaDimension,
  scored: ScoredRow[],
): string {
  const ownCount = scored.filter((s) => s.row.source === "own").length;
  const compCount = scored.length - ownCount;
  const corpus =
    compCount > 0
      ? `${scored.length} analysed posts across your library and ${compCount} from tracked competitors`
      : `${scored.length} analysed posts in your library`;
  const formatPosts = format.sampleSize === 1 ? "1 post" : `${format.sampleSize} posts`;
  return [
    `"${format.label}" is your strongest format right now (score ${format.score} across ${formatPosts}).`,
    `"${topic.label}" is the topic pulling the most traction (score ${topic.score}).`,
    `Open with a hook in the shape of the one below.`,
    `Built from ${corpus}.`,
  ].join(" ");
}

export function buildFormulaMatrix(
  rows: FormulaInputRow[],
  opts: FormulaMatrixOptions = {},
): FormulaMatrix {
  const trendCap = opts.trendCap ?? DEFAULT_TREND_CAP;
  const maxHooks = opts.maxHooks ?? DEFAULT_MAX_HOOKS;

  const scored: ScoredRow[] = [];
  for (const row of rows) {
    const score = scoreRow(row, trendCap);
    if (score === null) continue;
    scored.push({ row, score });
  }

  const formats = rankDimension(scored, (r) => r.format);
  const topics = rankDimension(scored, (r) => r.topic);
  const hooks = rankHooks(scored, maxHooks);

  let formula: SuggestedFormula | null = null;
  if (formats.length > 0 && topics.length > 0 && hooks.length > 0) {
    formula = {
      format: formats[0].label,
      topic: topics[0].label,
      hook: hooks[0].hook,
      rationale: buildRationale(formats[0], topics[0], scored),
    };
  }

  return { formats, topics, hooks, formula, sampleSize: scored.length };
}
