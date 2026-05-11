import { describe, expect, it } from "vitest";

import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import { MemoryEngine, parseExtractedFacts } from "./memory-engine";
import {
  buildMemoryExtractionUser,
  MEMORY_SYSTEM_PROMPT,
} from "./system-prompt";

const DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition.",
      example_topics: [],
    },
  ],
  prohibited_phrases: [],
  audience_persona: {
    description: "Coaches with proof of work.",
    pain_points: [],
    aspirations: [],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

class MockLLM implements ILLMClient {
  public readonly calls: Array<{ system: string; user: string }> = [];
  private response: string;
  private throws: Error | null = null;
  constructor(response: string) {
    this.response = response;
  }
  async complete(args: { system: string; user: string }): Promise<string> {
    this.calls.push(args);
    if (this.throws) throw this.throws;
    return this.response;
  }
  fail(err: Error) {
    this.throws = err;
  }
}

describe("Memory system prompt", () => {
  it("instructs the model to under-extract and emit JSON only", () => {
    expect(MEMORY_SYSTEM_PROMPT).toMatch(/Under-extract/i);
    expect(MEMORY_SYSTEM_PROMPT).toMatch(/Output ONLY a JSON object/);
    expect(MEMORY_SYSTEM_PROMPT).toContain("AT MOST 3 facts");
  });

  it("names all four categories", () => {
    expect(MEMORY_SYSTEM_PROMPT).toContain("ongoing_project");
    expect(MEMORY_SYSTEM_PROMPT).toContain("creator_context");
    expect(MEMORY_SYSTEM_PROMPT).toContain("preference");
    expect(MEMORY_SYSTEM_PROMPT).toContain("recent_topic");
  });

  it("user prompt embeds existing memories, pillar names, and recent turns", () => {
    const user = buildMemoryExtractionUser({
      voiceDna: DNA,
      existingMemories: [
        {
          id: "m1",
          fact: "Working on a 90-day launch",
          category: "ongoing_project",
          priority: 4,
          source_conversation_id: null,
          created_at: "2026-05-10T00:00:00.000Z",
        },
      ],
      recentTurns: [
        { role: "user", content: "I'm thinking of pivoting to e-commerce." },
        { role: "assistant", content: "Tell me more about why." },
      ],
    });
    expect(user).toContain("Operator Frameworks");
    expect(user).toContain("Working on a 90-day launch");
    expect(user).toContain("pivoting to e-commerce");
    expect(user).toContain("USER:");
    expect(user).toContain("ASSISTANT:");
  });

  it("user prompt says (none) when there are no existing memories", () => {
    const user = buildMemoryExtractionUser({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: [{ role: "user", content: "hi" }],
    });
    expect(user).toContain("(none)");
  });
});

describe("parseExtractedFacts", () => {
  it("parses a clean JSON object", () => {
    const out = parseExtractedFacts(
      JSON.stringify({
        facts: [
          { fact: "Launching X", category: "ongoing_project", priority: 4 },
        ],
      }),
    );
    expect(out).toEqual([
      { fact: "Launching X", category: "ongoing_project", priority: 4 },
    ]);
  });

  it("tolerates a prose wrapper around the JSON", () => {
    const out = parseExtractedFacts(
      `Sure thing. {"facts": [{"fact": "Hates the word unlock", "category": "preference", "priority": 3}]} that's all.`,
    );
    expect(out).toHaveLength(1);
    expect(out[0].fact).toBe("Hates the word unlock");
  });

  it("hard-caps to 3 facts per call", () => {
    const out = parseExtractedFacts(
      JSON.stringify({
        facts: Array.from({ length: 6 }, (_, i) => ({
          fact: `fact ${i}`,
          category: "recent_topic",
          priority: 2,
        })),
      }),
    );
    expect(out).toHaveLength(3);
  });

  it("drops items with unknown category", () => {
    const out = parseExtractedFacts(
      JSON.stringify({
        facts: [
          { fact: "good", category: "preference", priority: 2 },
          { fact: "bad", category: "made_up", priority: 2 },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].fact).toBe("good");
  });

  it("clamps priority to 1..5 and rounds non-integers", () => {
    const out = parseExtractedFacts(
      JSON.stringify({
        facts: [
          { fact: "a", category: "preference", priority: 0 },
          { fact: "b", category: "preference", priority: 99 },
          { fact: "c", category: "preference", priority: 3.7 },
        ],
      }),
    );
    expect(out[0].priority).toBe(1);
    expect(out[1].priority).toBe(5);
    expect(out[2].priority).toBe(4);
  });

  it("drops blank facts and facts over the char cap", () => {
    const longFact = "x".repeat(300);
    const out = parseExtractedFacts(
      JSON.stringify({
        facts: [
          { fact: "   ", category: "preference", priority: 2 },
          { fact: longFact, category: "preference", priority: 2 },
          { fact: "valid", category: "preference", priority: 2 },
        ],
      }),
    );
    expect(out).toEqual([
      { fact: "valid", category: "preference", priority: 2 },
    ]);
  });

  it("returns [] on garbage input", () => {
    expect(parseExtractedFacts("totally not json at all")).toEqual([]);
    expect(parseExtractedFacts("")).toEqual([]);
    expect(parseExtractedFacts("[]")).toEqual([]);
  });
});

describe("MemoryEngine.extract", () => {
  const HISTORY: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: "I'm prepping a launch for my $5K offer." },
    { role: "assistant", content: "Walk me through the structure." },
  ];

  it("returns an empty result when there are no recent turns", async () => {
    const llm = new MockLLM("{}");
    const engine = new MemoryEngine({ llm });

    const result = await engine.extract({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: [],
    });

    expect(result.facts).toEqual([]);
    expect(llm.calls).toHaveLength(0);
  });

  it("calls Haiku with the memory system prompt and a user payload that includes the turns", async () => {
    const llm = new MockLLM(
      JSON.stringify({
        facts: [
          { fact: "Launching a $5K offer", category: "ongoing_project", priority: 4 },
        ],
      }),
    );
    const engine = new MemoryEngine({ llm });

    await engine.extract({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: HISTORY,
    });

    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0].system).toBe(MEMORY_SYSTEM_PROMPT);
    expect(llm.calls[0].user).toContain("$5K offer");
  });

  it("returns parsed facts on a happy-path response", async () => {
    const llm = new MockLLM(
      JSON.stringify({
        facts: [
          { fact: "Launching a $5K offer", category: "ongoing_project", priority: 4 },
        ],
      }),
    );
    const engine = new MemoryEngine({ llm });

    const out = await engine.extract({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: HISTORY,
    });

    expect(out.facts).toEqual([
      { fact: "Launching a $5K offer", category: "ongoing_project", priority: 4 },
    ]);
  });

  it("returns an empty facts array on LLM error (best-effort, never throws)", async () => {
    const llm = new MockLLM("{}");
    llm.fail(new Error("anthropic 500"));
    const engine = new MemoryEngine({ llm });

    const out = await engine.extract({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: HISTORY,
    });

    expect(out.facts).toEqual([]);
  });

  it("returns [] on malformed LLM output without throwing", async () => {
    const llm = new MockLLM("not json");
    const engine = new MemoryEngine({ llm });

    const out = await engine.extract({
      voiceDna: DNA,
      existingMemories: [],
      recentTurns: HISTORY,
    });

    expect(out.facts).toEqual([]);
  });
});
