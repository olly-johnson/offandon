import { describe, expect, it } from "vitest";

import { SlopError, validateAntiSlop } from "@/lib/shared/anti-slop";

import { buildVoiceDNASystemPrompt, HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { OnboardingAnswers, VoiceDNA } from "./types";
import { VoiceEngine, type ILLMClient } from "./voice";

const BRO_INPUT: OnboardingAnswers = {
  niche: "fitness coaches",
  business_description: "10X your gains. No excuses, just results.",
  goals: ["Crush 100K followers", "Build a 7-figure empire"],
  voice_samples: [
    "YO listen up champ, if you ain't grinding you're losing.",
    "Wake up and dominate your day, no time for losers.",
  ],
  what_works: "Loud confident takes that call out lazy behaviour.",
  where_stuck: "Posts get views but not the right kind of clients.",
  target_audience: "Men 25-45 who want to look better and earn more.",
  preferred_topics: ["client acquisition", "fitness business systems"],
};

const PROFESSIONAL_DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic", "direct", "candid", "peer-to-peer"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition and retention.",
      example_topics: ["Lead-gen audit checklists", "Weekly content sprints"],
    },
    {
      name: "Receipts and Postmortems",
      description: "Specific case studies with numbers.",
      example_topics: ["What a 5K MRR client looked like", "A failed launch breakdown"],
    },
  ],
  prohibited_phrases: ["delve", "tapestry", "embark", "in today's digital landscape"],
  audience_persona: {
    description: "Coaches with proof of work who want serious clients, not lurkers.",
    pain_points: ["Inconsistent lead flow", "Audience that does not convert"],
    aspirations: ["Predictable monthly revenue", "Reputation as the operator"],
    language_register: "operator-to-operator, no jargon, no hype",
  },
  generated_at: "",
  source_questionnaire_hash: "",
};

const SLOP_DNA: VoiceDNA = {
  ...PROFESSIONAL_DNA,
  tone_profile: {
    ...PROFESSIONAL_DNA.tone_profile,
    primary: "professional—direct",
    descriptors: ["strategic", "direct ✨"],
  },
  audience_persona: {
    ...PROFESSIONAL_DNA.audience_persona,
    description: "Coaches who delve into client work.",
  },
};

class MockLLM implements ILLMClient {
  public readonly calls: Array<{ system: string; user: string }> = [];

  constructor(private readonly response: string) {}

  async complete(args: { system: string; user: string }): Promise<string> {
    this.calls.push(args);
    return this.response;
  }
}

const FROZEN_NOW = () => new Date("2026-05-09T12:00:00.000Z");

describe("anti-slop validator", () => {
  it("flags emoji output (sparkle)", () => {
    const r = validateAntiSlop("Welcome to Bot OS ✨");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.type === "emoji")).toBe(true);
  });

  it("flags emoji output (rocket)", () => {
    const r = validateAntiSlop("Launch 🚀 strategy");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.type === "emoji")).toBe(true);
  });

  it("flags em-dashes", () => {
    const r = validateAntiSlop("Strategic—and direct.");
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.type === "em_dash")).toBe(true);
  });

  it("flags the word delve at word boundaries (case-insensitive)", () => {
    expect(validateAntiSlop("Let's delve into this.").ok).toBe(false);
    expect(validateAntiSlop("Time to Delve deeper.").ok).toBe(false);
    expect(validateAntiSlop("That candelver string.").ok).toBe(true);
  });

  it("flags additional manifesto buzzwords", () => {
    expect(validateAntiSlop("A pivotal moment.").ok).toBe(false);
    expect(validateAntiSlop("A vibrant tapestry.").ok).toBe(false);
  });

  it("passes clean peer-to-peer copy", () => {
    const text = "This is a clean, direct take. No fluff. Just the work.";
    expect(validateAntiSlop(text).ok).toBe(true);
  });
});

describe("VoiceDNA system prompt", () => {
  it("loads the Humanization Manifesto verbatim from AGENTS.md", () => {
    expect(HUMANIZATION_MANIFESTO).toContain("Humanization Manifesto");
    expect(HUMANIZATION_MANIFESTO).toContain("em-dashes");
    expect(HUMANIZATION_MANIFESTO).toContain("Delve");
  });

  it("embeds the manifesto inside the system prompt", () => {
    const prompt = buildVoiceDNASystemPrompt();
    expect(prompt).toContain(HUMANIZATION_MANIFESTO);
    expect(prompt).toContain("BEGIN HUMANIZATION MANIFESTO");
    expect(prompt).toContain("END HUMANIZATION MANIFESTO");
    expect(prompt).toContain("anti-slop validator");
    expect(prompt).toContain("Voice DNA schema");
  });
});

describe("VoiceEngine — Scenario 1: bro-marketing input distilled to professional", () => {
  it("calls the LLM with the manifesto-embedded system prompt", async () => {
    const llm = new MockLLM(JSON.stringify(PROFESSIONAL_DNA));
    const engine = new VoiceEngine({ llm, now: FROZEN_NOW });

    await engine.generateDNA(BRO_INPUT);

    expect(llm.calls).toHaveLength(1);
    const { system, user } = llm.calls[0];
    expect(system).toContain("The Humanization Manifesto");
    expect(system).toContain("peer-to-peer");
    expect(user).toContain("fitness coaches");
    expect(user).toContain("Crush 100K followers");
  });

  it("returns a VoiceDNA whose tone_profile is professional, not bro", async () => {
    const llm = new MockLLM(JSON.stringify(PROFESSIONAL_DNA));
    const engine = new VoiceEngine({ llm, now: FROZEN_NOW });

    const dna = await engine.generateDNA(BRO_INPUT);

    expect(dna.tone_profile.primary).toMatch(/professional|direct|strategic/i);
    expect(dna.tone_profile.formality).toBe("conversational");
    expect(dna.tone_profile.descriptors).toEqual(
      expect.arrayContaining(["strategic", "direct"]),
    );
    for (const banned of ["bro", "hustle", "grind", "champ", "alpha"]) {
      expect(dna.tone_profile.descriptors).not.toContain(banned);
    }
  });

  it("stamps reproducibility metadata (timestamp, sha256 questionnaire hash)", async () => {
    const llm = new MockLLM(JSON.stringify(PROFESSIONAL_DNA));
    const engine = new VoiceEngine({ llm, now: FROZEN_NOW });

    const dna = await engine.generateDNA(BRO_INPUT);

    expect(dna.generated_at).toBe("2026-05-09T12:00:00.000Z");
    expect(dna.source_questionnaire_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces a stable hash for the same questionnaire", async () => {
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(PROFESSIONAL_DNA)),
      now: FROZEN_NOW,
    });
    const a = await engine.generateDNA(BRO_INPUT);
    const b = await engine.generateDNA(BRO_INPUT);
    expect(a.source_questionnaire_hash).toBe(b.source_questionnaire_hash);
  });
});

describe("VoiceEngine — Scenario 2: anti-slop validation of LLM output", () => {
  it("throws SlopError when the LLM output contains an em-dash", async () => {
    const sloppy: VoiceDNA = {
      ...PROFESSIONAL_DNA,
      tone_profile: {
        ...PROFESSIONAL_DNA.tone_profile,
        primary: "professional—direct",
      },
    };
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(sloppy)),
      now: FROZEN_NOW,
    });

    await expect(engine.generateDNA(BRO_INPUT)).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the LLM output contains an emoji", async () => {
    const sloppy: VoiceDNA = {
      ...PROFESSIONAL_DNA,
      tone_profile: {
        ...PROFESSIONAL_DNA.tone_profile,
        descriptors: ["strategic", "direct ✨"],
      },
    };
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(sloppy)),
      now: FROZEN_NOW,
    });

    await expect(engine.generateDNA(BRO_INPUT)).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the LLM output contains the word \"delve\"", async () => {
    const sloppy: VoiceDNA = {
      ...PROFESSIONAL_DNA,
      audience_persona: {
        ...PROFESSIONAL_DNA.audience_persona,
        description: "Coaches who delve into client work.",
      },
    };
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(sloppy)),
      now: FROZEN_NOW,
    });

    await expect(engine.generateDNA(BRO_INPUT)).rejects.toBeInstanceOf(SlopError);
  });

  it("the SlopError surfaces every detected violation, not just the first", async () => {
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(SLOP_DNA)),
      now: FROZEN_NOW,
    });

    try {
      await engine.generateDNA(BRO_INPUT);
      expect.fail("expected SlopError to be thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SlopError);
      const types = (e as SlopError).violations.map((v) => v.type);
      expect(types).toEqual(expect.arrayContaining(["em_dash", "emoji", "forbidden_word"]));
    }
  });

  it("does NOT slop-flag the prohibited_phrases array (it is metadata)", async () => {
    // PROFESSIONAL_DNA.prohibited_phrases literally lists "delve", "embark",
    // "in today's digital landscape" — that must not trip the validator.
    const engine = new VoiceEngine({
      llm: new MockLLM(JSON.stringify(PROFESSIONAL_DNA)),
      now: FROZEN_NOW,
    });

    await expect(engine.generateDNA(BRO_INPUT)).resolves.toBeDefined();
  });

  it("rejects malformed JSON from the LLM with a clear error", async () => {
    const engine = new VoiceEngine({
      llm: new MockLLM("not json at all"),
      now: FROZEN_NOW,
    });

    await expect(engine.generateDNA(BRO_INPUT)).rejects.toThrow(/valid JSON/);
  });
});
