import { describe, expect, it } from "vitest";

import { SlopError } from "@/lib/shared/anti-slop";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import { ScriptGenerator } from "./script-generator";
import { buildScriptsSystemPrompt, HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { GeneratedScript } from "./types";

const FIXTURE_DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic", "direct", "candid"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition.",
      example_topics: ["Lead-gen audit checklists", "Weekly content sprints"],
    },
    {
      name: "Receipts and Postmortems",
      description: "Specific case studies with numbers.",
      example_topics: ["What a 5K MRR client looked like"],
    },
  ],
  prohibited_phrases: ["delve", "tapestry"],
  audience_persona: {
    description: "Coaches with proof of work who want serious clients.",
    pain_points: ["Inconsistent lead flow"],
    aspirations: ["Predictable monthly revenue"],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

function makeScript(overrides: Partial<GeneratedScript> = {}): GeneratedScript {
  return {
    hook: "Most coaches lose leads at the same point. It is not their offer.",
    body: "It is the discovery call. They lead with credentials when the prospect needs to feel understood. Reverse the order: first 90 seconds is their problem in their words. Watch booking rates climb.",
    pillar: "Operator Frameworks",
    angle: "pain_point",
    ...overrides,
  };
}

class MockLLM implements ILLMClient {
  public readonly calls: Array<{ system: string; user: string }> = [];
  constructor(private readonly response: string) {}
  async complete(args: { system: string; user: string }): Promise<string> {
    this.calls.push(args);
    return this.response;
  }
}

const FROZEN_NOW = () => new Date("2026-05-09T12:00:00.000Z");

describe("scripts system prompt", () => {
  it("loads the Humanization Manifesto verbatim", () => {
    expect(HUMANIZATION_MANIFESTO).toContain("Humanization Manifesto");
    expect(HUMANIZATION_MANIFESTO).toContain("em-dashes");
  });

  it("embeds the manifesto and the creator's pillars + persona", () => {
    const prompt = buildScriptsSystemPrompt(FIXTURE_DNA);
    expect(prompt).toContain(HUMANIZATION_MANIFESTO);
    expect(prompt).toContain("BEGIN HUMANIZATION MANIFESTO");
    expect(prompt).toContain("BEGIN CREATOR'S VOICE DNA");
    expect(prompt).toContain("Operator Frameworks");
    expect(prompt).toContain("Receipts and Postmortems");
    expect(prompt).toContain("operator-to-operator");
    expect(prompt).toContain("Inconsistent lead flow");
  });

  it("includes the JSON shape anchor", () => {
    const prompt = buildScriptsSystemPrompt(FIXTURE_DNA);
    expect(prompt).toContain("Required JSON shape");
    expect(prompt).toContain("first character of your response must be {");
  });
});

describe("ScriptGenerator.generate", () => {
  it("calls the LLM with the manifesto-embedded system prompt and the count", async () => {
    const llm = new MockLLM(JSON.stringify({ scripts: [makeScript(), makeScript({ pillar: "Receipts and Postmortems", angle: "case_study" })] }));
    const generator = new ScriptGenerator({ llm, now: FROZEN_NOW });

    await generator.generate({ voiceDna: FIXTURE_DNA, count: 2 });

    expect(llm.calls).toHaveLength(1);
    const { system, user } = llm.calls[0];
    expect(system).toContain("Humanization Manifesto");
    expect(system).toContain("Operator Frameworks");
    expect(user).toContain('"count": 2');
  });

  it("returns the parsed scripts and stamps generation metadata", async () => {
    const scripts = [makeScript(), makeScript({ pillar: "Receipts and Postmortems", angle: "case_study" })];
    const llm = new MockLLM(JSON.stringify({ scripts }));
    const generator = new ScriptGenerator({ llm, now: FROZEN_NOW });

    const batch = await generator.generate({ voiceDna: FIXTURE_DNA, count: 7 });

    expect(batch.scripts).toEqual(scripts);
    expect(batch.meta.requested_count).toBe(7);
    expect(batch.meta.actual_count).toBe(2);
    expect(batch.meta.generated_at).toBe("2026-05-09T12:00:00.000Z");
  });

  it("throws when the LLM returns invalid JSON", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM("not json"),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toThrow(/valid JSON/);
  });

  it("throws when scripts array is missing", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ items: [] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toThrow(/scripts must be an array/);
  });

  it("throws when scripts array is empty", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts: [] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toThrow(/scripts array is empty/);
  });

  it("throws when a script's pillar is not in the creator's content_pillars", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts: [makeScript({ pillar: "Made-up Pillar" })] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toThrow(/not in the creator's content_pillars/);
  });

  it("throws when a script's angle is not a valid angle", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts: [makeScript({ angle: "thirstposting" as never })] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toThrow(/not a valid angle/);
  });

  it("throws SlopError when a script body contains an em-dash", async () => {
    const sloppy = makeScript({ body: "Strategic, direct—no fluff." });
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts: [sloppy] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when a hook contains an emoji", async () => {
    const sloppy = makeScript({ hook: "Stop the scroll ✨ and listen." });
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts: [sloppy] })),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 1 })).rejects.toBeInstanceOf(SlopError);
  });

  it("collects violations across all scripts in one SlopError", async () => {
    const scripts = [
      makeScript({ hook: "First sloppy hook ✨" }),
      makeScript({ body: "Second sloppy body—has em-dash" }),
    ];
    const generator = new ScriptGenerator({
      llm: new MockLLM(JSON.stringify({ scripts })),
      now: FROZEN_NOW,
    });
    try {
      await generator.generate({ voiceDna: FIXTURE_DNA, count: 2 });
      expect.fail("expected SlopError");
    } catch (e) {
      expect(e).toBeInstanceOf(SlopError);
      const types = (e as SlopError).violations.map((v) => v.type);
      expect(types).toEqual(expect.arrayContaining(["emoji", "em_dash"]));
    }
  });

  it("rejects count outside 1..30", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM("{}"),
      now: FROZEN_NOW,
    });
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 0 })).rejects.toThrow(/count must be between/);
    await expect(generator.generate({ voiceDna: FIXTURE_DNA, count: 31 })).rejects.toThrow(/count must be between/);
  });

  it("rejects VoiceDNA with no content_pillars", async () => {
    const generator = new ScriptGenerator({
      llm: new MockLLM("{}"),
      now: FROZEN_NOW,
    });
    const noDna = { ...FIXTURE_DNA, content_pillars: [] };
    await expect(generator.generate({ voiceDna: noDna, count: 1 })).rejects.toThrow(/no content_pillars/);
  });
});
