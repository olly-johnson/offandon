import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

import {
  enforceAnalysisRateLimit,
  RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D,
  ResearchRateLimitError,
} from "./rate-limit";

function makeClient(result: { count: number | null; error: { message: string } | null }) {
  const gte = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ gte });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, from, select, eq, gte };
}

describe("RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D", () => {
  it("defaults to 400 so a 5-creator watchlist (30 reels each) plus library fits", () => {
    expect(RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D).toBe(400);
  });
});

describe("enforceAnalysisRateLimit", () => {
  it("returns the used/limit pair when under cap", async () => {
    const { client, select, eq, gte } = makeClient({ count: 5, error: null });
    const out = await enforceAnalysisRateLimit({ supabase: client, userId: "u1" });
    expect(out.used).toBe(5);
    expect(out.limit).toBe(RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D);
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("user_id", "u1");
    expect(gte).toHaveBeenCalledWith("created_at", expect.any(String));
  });

  it("throws ResearchRateLimitError when used >= limit", async () => {
    const { client } = makeClient({
      count: RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D,
      error: null,
    });
    await expect(
      enforceAnalysisRateLimit({ supabase: client, userId: "u1" }),
    ).rejects.toBeInstanceOf(ResearchRateLimitError);
  });

  it("honours an explicit limit argument over the default", async () => {
    const { client } = makeClient({ count: 4, error: null });
    await expect(
      enforceAnalysisRateLimit({ supabase: client, userId: "u1", limit: 3 }),
    ).rejects.toBeInstanceOf(ResearchRateLimitError);
  });

  it("throws on supabase error so callers don't fail-open", async () => {
    const { client } = makeClient({ count: null, error: { message: "denied" } });
    await expect(
      enforceAnalysisRateLimit({ supabase: client, userId: "u1" }),
    ).rejects.toThrow(/denied/);
  });

  it("treats null count as 0", async () => {
    const { client } = makeClient({ count: null, error: null });
    const out = await enforceAnalysisRateLimit({ supabase: client, userId: "u1" });
    expect(out.used).toBe(0);
  });
});
