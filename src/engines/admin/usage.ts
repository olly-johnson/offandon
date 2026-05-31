/**
 * Anthropic API usage logging + roll-ups.
 *
 * Writes are fire-and-forget from every LLM call site via a service-role
 * client. Reads power the /admin spend metrics. Cost is computed in TS
 * from the four token columns + a per-model price map; storing it in
 * the table would lock us into the rate sheet at insert time, and
 * Anthropic re-prices models.
 */

import type { AdminSupabaseClient } from "./persistence";
import { createLogger } from "@/lib/shared/logger";

const log = createLogger("admin.usage");

export type ApiUsageSurface =
  | "chat"
  | "voice_dna"
  | "memory_extract"
  | "script"
  | "imf"
  | "hooks"
  | "single_script"
  | "script_refine"
  | "media_analysis"
  | "competitor_analysis"
  | "other";

export interface ApiUsageRow {
  id: string;
  user_id: string | null;
  surface: ApiUsageSurface;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  stop_reason: string | null;
  created_at: string;
}

export interface RecordApiUsageArgs {
  user_id: string | null;
  surface: ApiUsageSurface;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  stop_reason?: string | null;
}

/**
 * Per-model pricing in USD per 1M tokens. Updated by hand when
 * Anthropic re-prices. Unknown models fall through to 0 cost (we
 * surface tokens regardless; cost is best-effort).
 *
 * cache_creation = input * 1.25 (Sonnet/Opus only).
 * cache_read     = input * 0.10.
 */
interface ModelPricing {
  input: number;
  output: number;
  cache_write_multiplier: number;
  cache_read_multiplier: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cache_write_multiplier: 1.25,
    cache_read_multiplier: 0.1,
  },
  "claude-opus-4-7": {
    input: 15,
    output: 75,
    cache_write_multiplier: 1.25,
    cache_read_multiplier: 0.1,
  },
  "claude-haiku-4-5-20251001": {
    input: 1,
    output: 5,
    cache_write_multiplier: 1.25,
    cache_read_multiplier: 0.1,
  },
};

const ONE_MILLION = 1_000_000;

export function computeCostUsd(args: {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}): number {
  const p = PRICING[args.model];
  if (!p) return 0;
  const inputCost = (args.input_tokens * p.input) / ONE_MILLION;
  const outputCost = (args.output_tokens * p.output) / ONE_MILLION;
  const writeCost =
    (args.cache_creation_tokens * p.input * p.cache_write_multiplier) / ONE_MILLION;
  const readCost =
    (args.cache_read_tokens * p.input * p.cache_read_multiplier) / ONE_MILLION;
  return inputCost + outputCost + writeCost + readCost;
}

/**
 * Append one row to api_usage. Errors are swallowed and logged: token
 * accounting must never break the user-visible flow.
 */
export async function recordApiUsage(
  supabase: AdminSupabaseClient,
  args: RecordApiUsageArgs,
): Promise<void> {
  const row = {
    user_id: args.user_id,
    surface: args.surface,
    model: args.model,
    input_tokens: args.input_tokens ?? 0,
    output_tokens: args.output_tokens ?? 0,
    cache_creation_tokens: args.cache_creation_tokens ?? 0,
    cache_read_tokens: args.cache_read_tokens ?? 0,
    stop_reason: args.stop_reason ?? null,
  };
  const { error } = await supabase.from("api_usage").insert(row);
  if (error) {
    log.warn("recordApiUsage insert failed", {
      message: error.message,
      surface: args.surface,
      model: args.model,
    });
  }
}

/**
 * Read every api_usage row since the given cutoff (default: 30d).
 * Service-role only.
 */
export async function listApiUsageSince(
  supabase: AdminSupabaseClient,
  opts: { since?: Date; limit?: number } = {},
): Promise<ApiUsageRow[]> {
  const since = opts.since ?? new Date(Date.now() - 30 * 86_400_000);
  const limit = opts.limit ?? 100_000;
  const { data, error } = await supabase
    .from("api_usage")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    log.error("listApiUsageSince failed", { message: error.message });
    throw new Error(`listApiUsageSince: ${error.message}`);
  }
  return (data ?? []) as ApiUsageRow[];
}

export interface UsageByUser {
  user_id: string | null;
  row_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface UsageBySurface {
  surface: ApiUsageSurface;
  row_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

export interface UsageSummary {
  row_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
  by_user: UsageByUser[];
  by_surface: UsageBySurface[];
}

function emptyByUser(user_id: string | null): UsageByUser {
  return {
    user_id,
    row_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cost_usd: 0,
  };
}

function emptyBySurface(surface: ApiUsageSurface): UsageBySurface {
  return {
    surface,
    row_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    cost_usd: 0,
  };
}

export function summariseUsage(rows: ApiUsageRow[]): UsageSummary {
  const summary: UsageSummary = {
    row_count: rows.length,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_creation_tokens: 0,
    total_cache_read_tokens: 0,
    total_cost_usd: 0,
    by_user: [],
    by_surface: [],
  };
  const userMap = new Map<string | null, UsageByUser>();
  const surfaceMap = new Map<ApiUsageSurface, UsageBySurface>();

  for (const r of rows) {
    const cost = computeCostUsd(r);
    summary.total_input_tokens += r.input_tokens;
    summary.total_output_tokens += r.output_tokens;
    summary.total_cache_creation_tokens += r.cache_creation_tokens;
    summary.total_cache_read_tokens += r.cache_read_tokens;
    summary.total_cost_usd += cost;

    const u = userMap.get(r.user_id) ?? emptyByUser(r.user_id);
    u.row_count += 1;
    u.input_tokens += r.input_tokens;
    u.output_tokens += r.output_tokens;
    u.cache_creation_tokens += r.cache_creation_tokens;
    u.cache_read_tokens += r.cache_read_tokens;
    u.cost_usd += cost;
    userMap.set(r.user_id, u);

    const s = surfaceMap.get(r.surface) ?? emptyBySurface(r.surface);
    s.row_count += 1;
    s.input_tokens += r.input_tokens;
    s.output_tokens += r.output_tokens;
    s.cache_creation_tokens += r.cache_creation_tokens;
    s.cache_read_tokens += r.cache_read_tokens;
    s.cost_usd += cost;
    surfaceMap.set(r.surface, s);
  }

  summary.by_user = Array.from(userMap.values()).sort((a, b) => b.cost_usd - a.cost_usd);
  summary.by_surface = Array.from(surfaceMap.values()).sort((a, b) => b.cost_usd - a.cost_usd);
  return summary;
}
