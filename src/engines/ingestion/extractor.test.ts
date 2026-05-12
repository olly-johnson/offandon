import { describe, expect, it, vi } from "vitest";

import type { ILLMClient } from "@/engines/voice/voice";

import { IngestionExtractor, parseExtractedClientData } from "./extractor";
import type { ClientSourceFile, ExtractedClientData } from "./types";

const FIXTURE_FILES: ClientSourceFile[] = [
  {
    relativePath: "voice_profile.md",
    body: "# Voice Profile\n\n## Tone\n- grounded, direct\n",
  },
  {
    relativePath: "config.json",
    body: JSON.stringify({ client_name: "Test User", content_pillars: [] }),
  },
];

function fixtureValidJson(): string {
  const data: ExtractedClientData = {
    profile: { display_name: "Test User", handle: "testuser" },
    voice_dna: {
      tone_profile: {
        primary: "grounded-direct",
        energy: "high",
        formality: "conversational",
        descriptors: ["grounded", "direct"],
      },
      content_pillars: [
        {
          name: "Identity",
          description: "Who you are online vs offline.",
          example_topics: ["Personal branding", "Authenticity"],
        },
      ],
      prohibited_phrases: ["delve", "leverage"],
      audience_persona: {
        description: "Solo founders stuck on content.",
        pain_points: ["Crickets on posts"],
        aspirations: ["Inbound DMs"],
        language_register: "operator-to-operator",
      },
      generated_at: "2026-05-12T10:00:00.000Z",
      source_questionnaire_hash: "ingestion",
    },
    source_answers: {
      niche: "Personal branding for founders",
      business_description: "Helps founders build personal brands.",
      goals: ["25k followers"],
      voice_samples: ["Verbatim sample 1.", "Verbatim sample 2."],
      what_works: "Vulnerable storytelling.",
      where_stuck: "Hook variety.",
      icp: {
        pain_points: ["No leads from content"],
        desires: ["Inbound clients"],
        thoughts_at_2am: ["Am I building something real?"],
        internal_battles: ["Want to be seen, scared of posting"],
        dreams: ["A one-of-one brand"],
      },
      positioning: {
        core_philosophy: "Trust is the most valuable currency.",
        contrarian_belief: "Personal branding is not posting more.",
        differentiator: "Documenting the journey instead of teaching from a pedestal.",
      },
    },
    client_assets: [
      {
        asset_type: "story",
        title: "Getting Kicked Out at 16",
        body: "Hosted a party, parents kicked me out for six months.",
        metadata: { category: "rock_bottom", funnel_fit: "top" },
        source_file: "story_bank.md#getting-kicked-out-at-16",
      },
    ],
    user_memories: [
      {
        fact: "Currently building Game of Life season 2.",
        category: "ongoing_project",
        priority: 4,
      },
    ],
    user_methodology:
      "TOF CTA: 'But remember, I'm just the player not the guru, that was Day [X]'.",
  };
  return JSON.stringify(data);
}

function makeLLM(out: string): ILLMClient {
  return { complete: vi.fn().mockResolvedValue(out) };
}

describe("IngestionExtractor.extract", () => {
  it("calls the LLM with the system + user prompts and returns parsed data", async () => {
    const llm = makeLLM(fixtureValidJson());
    const engine = new IngestionExtractor({ llm });

    const out = await engine.extract({
      clientSlug: "test_user",
      files: FIXTURE_FILES,
      nowIso: "2026-05-12T10:00:00.000Z",
    });

    expect(llm.complete).toHaveBeenCalledTimes(1);
    const call = (llm.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.system).toContain("Schema");
    expect(call.user).toContain("voice_profile.md");
    expect(call.user).toContain("config.json");
    expect(call.user).toContain("test_user");

    expect(out.profile.display_name).toBe("Test User");
    expect(out.voice_dna.content_pillars).toHaveLength(1);
    expect(out.client_assets).toHaveLength(1);
    expect(out.user_memories[0].category).toBe("ongoing_project");
  });

  it("throws when the LLM call fails (ingestion is fail-loud, not best-effort)", async () => {
    const llm: ILLMClient = {
      complete: vi.fn().mockRejectedValue(new Error("rate limit")),
    };
    const engine = new IngestionExtractor({ llm });

    await expect(
      engine.extract({
        clientSlug: "test_user",
        files: FIXTURE_FILES,
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    ).rejects.toThrow(/rate limit/);
  });

  it("throws if the LLM returns unparseable JSON", async () => {
    const llm = makeLLM("Sorry, I cannot help with that request.");
    const engine = new IngestionExtractor({ llm });

    await expect(
      engine.extract({
        clientSlug: "test_user",
        files: FIXTURE_FILES,
        nowIso: "2026-05-12T10:00:00.000Z",
      }),
    ).rejects.toThrow(/parse/i);
  });
});

describe("parseExtractedClientData", () => {
  it("returns the parsed object for valid input", () => {
    const data = parseExtractedClientData(fixtureValidJson());
    expect(data.voice_dna.tone_profile.primary).toBe("grounded-direct");
    expect(data.source_answers.icp.pain_points).toEqual(["No leads from content"]);
  });

  it("tolerates a prose wrapper around the JSON object", () => {
    const wrapped = `Here is the extract:\n\n${fixtureValidJson()}\n\nLet me know if anything looks off.`;
    const data = parseExtractedClientData(wrapped);
    expect(data.profile.display_name).toBe("Test User");
  });

  it("tolerates a fenced markdown wrapper", () => {
    const fenced = "```json\n" + fixtureValidJson() + "\n```";
    const data = parseExtractedClientData(fenced);
    expect(data.profile.display_name).toBe("Test User");
  });

  it("throws if the JSON is missing voice_dna", () => {
    const obj = JSON.parse(fixtureValidJson());
    delete obj.voice_dna;
    expect(() => parseExtractedClientData(JSON.stringify(obj))).toThrow(
      /voice_dna/,
    );
  });

  it("throws if the JSON is missing source_answers", () => {
    const obj = JSON.parse(fixtureValidJson());
    delete obj.source_answers;
    expect(() => parseExtractedClientData(JSON.stringify(obj))).toThrow(
      /source_answers/,
    );
  });

  it("defaults user_methodology to '' when absent", () => {
    const obj = JSON.parse(fixtureValidJson());
    delete obj.user_methodology;
    const data = parseExtractedClientData(JSON.stringify(obj));
    expect(data.user_methodology).toBe("");
  });

  it("drops client_assets rows with unknown asset_type rather than throwing", () => {
    const obj = JSON.parse(fixtureValidJson());
    obj.client_assets.push({
      asset_type: "not_a_real_type",
      title: "x",
      body: "y",
      metadata: {},
      source_file: "z.md",
    });
    const data = parseExtractedClientData(JSON.stringify(obj));
    expect(data.client_assets).toHaveLength(1);
    expect(data.client_assets[0].asset_type).toBe("story");
  });

  it("drops user_memories rows with unknown category", () => {
    const obj = JSON.parse(fixtureValidJson());
    obj.user_memories.push({
      fact: "Random fact",
      category: "made_up_category",
      priority: 3,
    });
    const data = parseExtractedClientData(JSON.stringify(obj));
    expect(data.user_memories).toHaveLength(1);
  });

  it("clamps user_memories priority to 1..5", () => {
    const obj = JSON.parse(fixtureValidJson());
    obj.user_memories = [
      { fact: "high", category: "ongoing_project", priority: 99 },
      { fact: "low", category: "ongoing_project", priority: -5 },
      { fact: "none", category: "ongoing_project" },
    ];
    const data = parseExtractedClientData(JSON.stringify(obj));
    expect(data.user_memories.map((m) => m.priority)).toEqual([5, 1, 3]);
  });
});
