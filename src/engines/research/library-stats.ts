import type { LibraryStats } from "./types";

/**
 * Compute reach percentiles from the user's own media. Used by the
 * analyzer to label any single video relative to the rest of the
 * creator's library.
 *
 * Skips null reaches (unsynced or pre-business-account rows). If fewer
 * than 5 rows have reach, returns all-nulls + the small sample_size so
 * the prompt knows not to lean on percentile labels.
 */
export function computeLibraryStats(
  reaches: Array<number | null | undefined>,
): LibraryStats {
  const xs = reaches
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (xs.length < 5) {
    return {
      median_reach: null,
      p20_reach: null,
      p80_reach: null,
      sample_size: xs.length,
    };
  }

  return {
    median_reach: percentile(xs, 0.5),
    p20_reach: percentile(xs, 0.2),
    p80_reach: percentile(xs, 0.8),
    sample_size: xs.length,
  };
}

/**
 * Linear-interpolation percentile. Matches the "type 7" default used
 * by R / numpy / pandas. Caller must pass a pre-sorted asc array.
 */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}
