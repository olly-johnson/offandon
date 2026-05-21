import { describe, expect, it, vi } from "vitest";

import type { MediaAnalysis } from "@/engines/research";
import {
  getAnalysesForCompetitorMediaIds,
  getAnalysisForCompetitorMedia,
  saveCompetitorAnalysis,
  type CompetitorAnalysisSupabaseClient,
} from "./analysis-persistence";

const ANALYSIS: MediaAnalysis = {
  transcript: "hello",
  hook: "Three things I learned",
  structure: "List of three",
  pillar_match: "Operator Frameworks",
  performance_score: 9,
  what_worked: "Curiosity gap",
  what_to_repeat: "Number-led hook",
};

describe("saveCompetitorAnalysis", () => {
  it("upserts on media_id with denormalised competitor_id + user_id + model ids", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "competitor_media_analysis") return { upsert };
      if (table === "research_analysis_runs") return { insert };
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    await saveCompetitorAnalysis(supabase, {
      mediaId: "Cxyz",
      competitorId: "c1",
      userId: "u1",
      analysis: ANALYSIS,
      llmModel: "claude-sonnet-4-6",
      transcriptModel: "deepgram-nova-3",
    });

    expect(from).toHaveBeenCalledWith("competitor_media_analysis");
    const [row] = upsert.mock.calls[0];
    expect(row).toMatchObject({
      media_id: "Cxyz",
      competitor_id: "c1",
      user_id: "u1",
      transcript: "hello",
      hook: "Three things I learned",
      structure: "List of three",
      pillar_match: "Operator Frameworks",
      performance_score: 9,
      what_worked: "Curiosity gap",
      what_to_repeat: "Number-led hook",
      llm_model: "claude-sonnet-4-6",
      transcript_model: "deepgram-nova-3",
    });
    expect(row.analyzed_at).toBeTruthy();
  });

  it("writes a research_analysis_runs audit row (shared rate-limit log)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "competitor_media_analysis") return { upsert };
      if (table === "research_analysis_runs") return { insert };
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    await saveCompetitorAnalysis(supabase, {
      mediaId: "Cxyz",
      competitorId: "c1",
      userId: "u1",
      analysis: ANALYSIS,
      llmModel: "claude-sonnet-4-6",
      transcriptModel: "deepgram-nova-3",
    });

    expect(insert).toHaveBeenCalledWith({ user_id: "u1", media_id: "Cxyz" });
  });

  it("propagates upsert errors as Error", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ error: { code: "23503", message: "FK" } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockImplementation((table: string) =>
      table === "competitor_media_analysis" ? { upsert } : { insert },
    );
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    await expect(
      saveCompetitorAnalysis(supabase, {
        mediaId: "Cxyz",
        competitorId: "c1",
        userId: "u1",
        analysis: ANALYSIS,
        llmModel: "x",
        transcriptModel: "y",
      }),
    ).rejects.toThrow(/saveCompetitorAnalysis/);
  });
});

describe("getAnalysisForCompetitorMedia", () => {
  it("returns the row keyed on media_id", async () => {
    const row = { ...ANALYSIS };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    const out = await getAnalysisForCompetitorMedia(supabase, "Cxyz");
    expect(out).toEqual(row);
    expect(from).toHaveBeenCalledWith("competitor_media_analysis");
    expect(eq).toHaveBeenCalledWith("media_id", "Cxyz");
  });

  it("returns null when no row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    expect(await getAnalysisForCompetitorMedia(supabase, "Cxyz")).toBeNull();
  });
});

describe("getAnalysesForCompetitorMediaIds", () => {
  it("returns a map keyed by media_id", async () => {
    const rows = [
      { media_id: "Cabc", ...ANALYSIS, hook: "first" },
      { media_id: "Cdef", ...ANALYSIS, hook: "second" },
    ];
    const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn().mockReturnValue({ in: inFn });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    const out = await getAnalysesForCompetitorMediaIds(supabase, ["Cabc", "Cdef"]);
    expect(out.size).toBe(2);
    expect(out.get("Cabc")?.hook).toBe("first");
    expect(out.get("Cdef")?.hook).toBe("second");
    expect(inFn).toHaveBeenCalledWith("media_id", ["Cabc", "Cdef"]);
  });

  it("returns an empty map for an empty input without hitting the DB", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as CompetitorAnalysisSupabaseClient;

    const out = await getAnalysesForCompetitorMediaIds(supabase, []);
    expect(out.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
