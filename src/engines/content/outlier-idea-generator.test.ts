import { describe, expect, it } from "vitest";

import { SlopError } from "@/lib/shared/anti-slop";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import { OutlierIdeaGenerator } from "./outlier-idea-generator";
import { buildOutlierIdeaSystemPrompt } from "./outlier-idea-system-prompt";
import { HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { ScriptsCorpusContext } from "./corpus-context";
import type { GenerateOutlierIdeasInput, OutlierPattern } from "./types";

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
      example_topics: ["Lead-gen audit checklists"],
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

const FIXTURE_OUTLIER: OutlierPattern = {
  hook: "I fired my best client. Here is why.",
  structure: "Confrontational hook, contrarian stance, story, lesson, CTA.",
  caption: "Sometimes the highest-paying client is the one bleeding you dry.",
  transcript: "I fired my best client last week and revenue went up...",
  pillar_match: "Receipts and Postmortems",
  source_username: "garyvee",
};

function input(overrides: Partial<GenerateOutlierIdeasInput> = {}): GenerateOutlierIdeasInput {
  return { voiceDna: FIXTURE_DNA, outlier: FIXTURE_OUTLIER, count: 3, ...overrides };
}

const VALID_RESPONSE = JSON.stringify({
  ideas: [
    {
      content: "The day I turned down a 10k retainer because the founder wouldn't do the work. What changed after.",
      pillar: "Receipts and Postmortems",
      angle: "story",
    },
    {
      content: "Your highest-paying client might be your biggest bottleneck. How I audit who actually deserves my time.",
      pillar: "Operator Frameworks",
      angle: "contrarian",
    },
    {
      content: "Why I now run a quarterly client cull, and the simple scorecard I use to decide who stays.",
      pillar: "Operator Frameworks",
      angle: "framework",
    },
  ],
});

class MockLLM implements ILLMClient {
  public readonly calls: Array<{ system: string; user: string }> = [];
  constructor(private readonly response: string) {}
  async complete(args: { system: string; user: string }): Promise<string> {
    this.calls.push(args);
    return this.response;
  }
}

const FROZEN_NOW = () => new Date("2026-05-09T12:00:00.000Z");

describe("buildOutlierIdeaSystemPrompt", () => {
  it("embeds the manifesto, the creator's pillars, and the own-story rule", () => {
    const prompt = buildOutlierIdeaSystemPrompt(FIXTURE_DNA);
    expect(prompt).toContain(HUMANIZATION_MANIFESTO);
    expect(prompt).toContain("Operator Frameworks");
    expect(prompt).toContain("Receipts and Postmortems");
    // The defining rule: mirror the pattern, write about the creator's own life.
    expect(prompt.toLowerCase()).toContain("own");
    expect(prompt.toLowerCase()).toMatch(/never (retell|reuse|copy)/);
  });

  it("includes the user methodology block when provided", () => {
    const prompt = buildOutlierIdeaSystemPrompt(FIXTURE_DNA, "Never say unlock.");
    expect(prompt).toContain("Never say unlock.");
  });

  it("renders the client assets block when stories are provided", () => {
    const clientAssets = {
      stories: [
        {
          asset_type: "story" as const,
          title: "The fired-best-client moment",
          body: "Sat in the airport for two hours after I told them.",
          metadata: { category: "rock_bottom" },
        },
      ],
      viral_references: [],
      templates: [],
      past_scripts: [],
    };
    const prompt = buildOutlierIdeaSystemPrompt(
      FIXTURE_DNA,
      null,
      undefined,
      [],
      clientAssets,
    );
    expect(prompt).toContain("BEGIN CREATOR'S OWN MATERIAL");
    expect(prompt).toContain("The fired-best-client moment");
  });

  it("renders the corpus block when corpus hits are provided", () => {
    const corpusContext: ScriptsCorpusContext = {
      hits: [
        {
          chunk_id: "ch1",
          document_id: "doc1",
          chunk_index: 0,
          similarity: 0.81,
          source_type: "fathom_transcript",
          document_title: "Coaching call with Alex",
          captured_at: "2026-04-12T00:00:00.000Z",
          chunk_text: "The single biggest hire that broke our operator playbook.",
        },
      ],
    };
    const prompt = buildOutlierIdeaSystemPrompt(
      FIXTURE_DNA,
      null,
      undefined,
      [],
      null,
      corpusContext,
    );
    expect(prompt).toContain("BEGIN CREATOR'S CORPUS");
    expect(prompt).toContain("Coaching call with Alex");
  });

  it("renders the onboarding extras block: contrarian belief, ICP axes, story-bank seeds, signature phrases", () => {
    const extras = {
      icp: {
        thoughts_at_2am: ["What if the next hire is the wrong one"],
        internal_battles: ["Charge more vs feel guilty"],
        dreams: ["Run the business on four days a week"],
      },
      positioning: {
        core_philosophy: "Operators win on systems, not vibes.",
        contrarian_belief: "Most coaching frameworks are theatre.",
        differentiator: "Receipts over rhetoric.",
      },
      story_bank: {
        rock_bottom: "Down to 11 days of runway in 2024.",
        breakthrough: "Sold three retainers in one week after one offer rewrite.",
      },
      voice_signals: {
        signature_phrases: ["receipts over rhetoric", "do the work"],
        humor_style: "dry",
      },
    };
    const prompt = buildOutlierIdeaSystemPrompt(
      FIXTURE_DNA,
      null,
      undefined,
      [],
      null,
      null,
      extras,
    );
    expect(prompt).toContain("BEGIN CREATOR'S CONTENT STRATEGY");
    expect(prompt).toContain("contrarian_belief: Most coaching frameworks are theatre.");
    expect(prompt).toContain("Charge more vs feel guilty");
    expect(prompt).toContain("Down to 11 days of runway in 2024.");
    expect(prompt).toContain("receipts over rhetoric, do the work");
  });

  it("omits the onboarding extras block entirely when every field is empty", () => {
    const prompt = buildOutlierIdeaSystemPrompt(
      FIXTURE_DNA,
      null,
      undefined,
      [],
      null,
      null,
      { icp: { thoughts_at_2am: [] }, positioning: {} },
    );
    expect(prompt).not.toContain("BEGIN CREATOR'S CONTENT STRATEGY");
  });
});

describe("OutlierIdeaGenerator", () => {
  it("returns the parsed ideas with meta", async () => {
    const gen = new OutlierIdeaGenerator({ llm: new MockLLM(VALID_RESPONSE), now: FROZEN_NOW });
    const out = await gen.generate(input());
    expect(out.ideas).toHaveLength(3);
    expect(out.ideas[0].pillar).toBe("Receipts and Postmortems");
    expect(out.ideas[1].angle).toBe("contrarian");
    expect(out.meta).toEqual({
      requested_count: 3,
      actual_count: 3,
      generated_at: "2026-05-09T12:00:00.000Z",
    });
  });

  it("feeds the outlier pattern into the user payload", async () => {
    const llm = new MockLLM(VALID_RESPONSE);
    const gen = new OutlierIdeaGenerator({ llm, now: FROZEN_NOW });
    await gen.generate(input());
    const userPayload = llm.calls[0].user;
    expect(userPayload).toContain("I fired my best client");
    expect(userPayload).toContain("garyvee");
    expect(userPayload).toContain("3");
  });

  it("caps the requested count to 1..5", async () => {
    const llm = new MockLLM(VALID_RESPONSE);
    const gen = new OutlierIdeaGenerator({ llm, now: FROZEN_NOW });
    await gen.generate(input({ count: 99 }));
    expect(llm.calls[0].user).toContain("5");
    expect(llm.calls[0].user).not.toContain("99");
  });

  it("throws when the LLM returns invalid JSON", async () => {
    const gen = new OutlierIdeaGenerator({ llm: new MockLLM("not json"), now: FROZEN_NOW });
    await expect(gen.generate(input())).rejects.toThrow(/JSON/i);
  });

  it("throws when an idea's pillar is not in the creator's content_pillars", async () => {
    const bad = JSON.stringify({
      ideas: [{ content: "A fine idea about my own work.", pillar: "Made Up Pillar", angle: "story" }],
    });
    const gen = new OutlierIdeaGenerator({ llm: new MockLLM(bad), now: FROZEN_NOW });
    await expect(gen.generate(input())).rejects.toThrow(/pillar/i);
  });

  it("throws SlopError when an idea contains an em-dash", async () => {
    const slop = JSON.stringify({
      ideas: [
        {
          content: "I fired my best client — here is what happened next.",
          pillar: "Operator Frameworks",
          angle: "story",
        },
      ],
    });
    const gen = new OutlierIdeaGenerator({ llm: new MockLLM(slop), now: FROZEN_NOW });
    await expect(gen.generate(input())).rejects.toBeInstanceOf(SlopError);
  });

  it("throws when the response has no ideas array", async () => {
    const gen = new OutlierIdeaGenerator({
      llm: new MockLLM(JSON.stringify({ ideas: [] })),
      now: FROZEN_NOW,
    });
    await expect(gen.generate(input())).rejects.toThrow(/idea/i);
  });
});
