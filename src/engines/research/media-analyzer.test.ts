import { describe, expect, it, vi } from "vitest";

import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import { MediaAnalyzer, parseAnalysisJson } from "./media-analyzer";
import type { LibraryStats, MediaAnalysisInput } from "./types";

const VOICE_DNA: VoiceDNA = {
  tone_profile: {
    primary: "grounded-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["grounded"],
  },
  content_pillars: [
    { name: "Identity", description: "Who you are.", example_topics: ["x"] },
    { name: "Business", description: "Operator frameworks.", example_topics: ["y"] },
  ],
  prohibited_phrases: [],
  audience_persona: {
    description: "Solo founders.",
    pain_points: [],
    aspirations: [],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-13T00:00:00.000Z",
  source_questionnaire_hash: "test",
};

const LIBRARY_STATS: LibraryStats = {
  median_reach: 5000,
  p20_reach: 1000,
  p80_reach: 20000,
  sample_size: 30,
};

const MEDIA: MediaAnalysisInput = {
  caption: "Big lessons from Mexico",
  reach: 25000,
  plays: 30000,
  like_count: 800,
  comments_count: 42,
  saved: 120,
  shares: 30,
  posted_at: "2026-04-01T10:00:00.000Z",
};

function makeLLM(out: string): ILLMClient {
  return { complete: vi.fn().mockResolvedValue(out) };
}

const VALID_ANALYSIS = JSON.stringify({
  hook: "Three things broke me in Mexico.",
  structure: "Three-act with a list-of-three hook into rock-bottom arc.",
  pillar_match: "Identity",
  performance_score: 9,
  what_worked: "Hook fronts a number before any context, forcing curiosity.",
  what_to_repeat: "Open with a numbered list before naming the topic.",
});

describe("MediaAnalyzer.analyze", () => {
  it("returns transcript + parsed LLM analysis", async () => {
    const llm = makeLLM(VALID_ANALYSIS);
    const analyzer = new MediaAnalyzer({ llm });

    const out = await analyzer.analyze({
      voiceDna: VOICE_DNA,
      libraryStats: LIBRARY_STATS,
      media: MEDIA,
      transcript: "Three things broke me in Mexico. I sat in the airport for two hours.",
    });

    expect(out.transcript).toContain("Three things broke me");
    expect(out.hook).toBe("Three things broke me in Mexico.");
    expect(out.pillar_match).toBe("Identity");
    expect(out.performance_score).toBe(9);
  });

  it("passes voice_dna pillars + library stats into the user prompt", async () => {
    const llm = makeLLM(VALID_ANALYSIS);
    const analyzer = new MediaAnalyzer({ llm });

    await analyzer.analyze({
      voiceDna: VOICE_DNA,
      libraryStats: LIBRARY_STATS,
      media: MEDIA,
      transcript: "Some transcript.",
    });

    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.user).toContain("Identity, Business");
    expect(call.user).toContain("p80_reach:   20000");
    expect(call.user).toContain("reach:          25000");
    expect(call.user).toContain("Some transcript.");
  });

  it("throws when transcript is empty (refuses to call LLM)", async () => {
    const llm = makeLLM(VALID_ANALYSIS);
    const analyzer = new MediaAnalyzer({ llm });

    await expect(
      analyzer.analyze({
        voiceDna: VOICE_DNA,
        libraryStats: LIBRARY_STATS,
        media: MEDIA,
        transcript: "   ",
      }),
    ).rejects.toThrow(/transcript/i);
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("rethrows LLM errors", async () => {
    const llm: ILLMClient = {
      complete: vi.fn().mockRejectedValue(new Error("rate limit")),
    };
    const analyzer = new MediaAnalyzer({ llm });

    await expect(
      analyzer.analyze({
        voiceDna: VOICE_DNA,
        libraryStats: LIBRARY_STATS,
        media: MEDIA,
        transcript: "Some transcript.",
      }),
    ).rejects.toThrow(/rate limit/);
  });
});

describe("parseAnalysisJson", () => {
  it("parses a clean JSON object", () => {
    const out = parseAnalysisJson(VALID_ANALYSIS);
    expect(out.hook).toBe("Three things broke me in Mexico.");
    expect(out.performance_score).toBe(9);
  });

  it("tolerates a markdown-fenced wrapper", () => {
    const fenced = "```json\n" + VALID_ANALYSIS + "\n```";
    const out = parseAnalysisJson(fenced);
    expect(out.pillar_match).toBe("Identity");
  });

  it("tolerates a prose wrapper", () => {
    const wrapped = `Here's the analysis:\n\n${VALID_ANALYSIS}\n\nDone.`;
    const out = parseAnalysisJson(wrapped);
    expect(out.what_to_repeat).toBe("Open with a numbered list before naming the topic.");
  });

  it("returns null for fields the model omitted", () => {
    const partial = JSON.stringify({
      hook: "Something",
      structure: null,
      pillar_match: null,
      performance_score: null,
      what_worked: null,
      what_to_repeat: null,
    });
    const out = parseAnalysisJson(partial);
    expect(out.hook).toBe("Something");
    expect(out.structure).toBeNull();
    expect(out.performance_score).toBeNull();
  });

  it("accepts performance_score as a numeric string", () => {
    const out = parseAnalysisJson(
      JSON.stringify({ hook: "x", performance_score: "7" }),
    );
    expect(out.performance_score).toBe(7);
  });

  it("rounds non-integer performance_score", () => {
    const out = parseAnalysisJson(
      JSON.stringify({ hook: "x", performance_score: 6.4 }),
    );
    expect(out.performance_score).toBe(6);
  });

  it("rejects performance_score outside 0-10 range", () => {
    const high = parseAnalysisJson(
      JSON.stringify({ hook: "x", performance_score: 11 }),
    );
    expect(high.performance_score).toBeNull();
    const low = parseAnalysisJson(
      JSON.stringify({ hook: "x", performance_score: -1 }),
    );
    expect(low.performance_score).toBeNull();
  });

  it("drops non-numeric performance_score values to null", () => {
    const bad = JSON.stringify({
      hook: "x",
      structure: "y",
      pillar_match: "z",
      performance_score: "amazing",
      what_worked: "w",
      what_to_repeat: "r",
    });
    const out = parseAnalysisJson(bad);
    expect(out.performance_score).toBeNull();
  });

  it("strips em-dashes from string fields via the ingestion sanitiser", () => {
    const withDashes = JSON.stringify({
      hook: "Three things — really three — broke me.",
      structure: "Drug PSA framework — hostile aside up front.",
      pillar_match: "Identity",
      performance_score: 7,
      what_worked: "Hook fronts a number — then the hostile aside.",
      what_to_repeat: "Open with a numbered list, then add the aside.",
    });
    const out = parseAnalysisJson(withDashes);
    expect(out.hook).toBe("Three things, really three, broke me.");
    expect(out.structure).toBe("Drug PSA framework, hostile aside up front.");
    expect(out.what_worked).toBe(
      "Hook fronts a number, then the hostile aside.",
    );
  });

  it("throws when input is not parseable as JSON at all", () => {
    expect(() => parseAnalysisJson("Sorry I cannot help.")).toThrow(/parse/i);
  });

  it("throws when top-level value is not an object", () => {
    expect(() => parseAnalysisJson(JSON.stringify(["not", "an", "object"]))).toThrow();
  });
});
