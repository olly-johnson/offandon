import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

/**
 * Per-user rolling 30-day analysis cap. Whisper / Deepgram spend is
 * bounded by this. Default 100, env-overridable so we can tune
 * post-launch without a deploy. Service-role only (the limit log
 * table has no authenticated grants).
 */
export const RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D = 100;
export const RESEARCH_ANALYSIS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export class ResearchRateLimitError extends Error {
  readonly used: number;
  readonly limit: number;
  constructor(used: number, limit: number) {
    super(
      `Research analysis rate limit reached (${used}/${limit} in the last 30 days)`,
    );
    this.name = "ResearchRateLimitError";
    this.used = used;
    this.limit = limit;
  }
}

export interface EnforceArgs {
  supabase: SupabaseClient<Database>;
  userId: string;
  now?: Date;
  limit?: number;
}

/**
 * Throws ResearchRateLimitError if the user has hit the cap. Returns
 * the current used/limit on success so callers can render the count
 * back to the operator.
 */
export async function enforceAnalysisRateLimit(
  args: EnforceArgs,
): Promise<{ used: number; limit: number }> {
  const now = args.now ?? new Date();
  const limit =
    args.limit ?? readLimitFromEnv() ?? RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D;
  const since = new Date(now.getTime() - RESEARCH_ANALYSIS_WINDOW_MS).toISOString();

  const { count, error } = await args.supabase
    .from("research_analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .gte("created_at", since);
  if (error) {
    throw new Error(`enforceAnalysisRateLimit: ${error.message}`);
  }
  const used = count ?? 0;
  if (used >= limit) {
    throw new ResearchRateLimitError(used, limit);
  }
  return { used, limit };
}

function readLimitFromEnv(): number | null {
  const raw = process.env.RESEARCH_ANALYSIS_MAX_PER_30D;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
