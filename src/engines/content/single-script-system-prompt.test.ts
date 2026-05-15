import { describe, expect, it } from "vitest";

import type { VoiceDNA } from "@/engines/voice/types";

import type { ScriptAssetsContext } from "./client-assets-persistence";
import { buildSingleScriptSystemPrompt } from "./single-script-system-prompt";

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
      description: "Systems.",
      example_topics: ["audits"],
    },
  ],
  prohibited_phrases: ["delve"],
  audience_persona: {
    description: "Coaches with proof.",
    pain_points: ["Lead flow"],
    aspirations: ["Predictable revenue"],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

const HOOK = "Most coaches lose leads at the same point. It is not their offer.";

function makeAssets(
  past_scripts: ScriptAssetsContext["past_scripts"],
): ScriptAssetsContext {
  return {
    stories: [],
    viral_references: [],
    templates: [],
    past_scripts,
  };
}

describe("buildSingleScriptSystemPrompt — past script reference block (BO-053)", () => {
  it("does not render the block when no clientAssets are provided", () => {
    const prompt = buildSingleScriptSystemPrompt(DNA, HOOK);
    expect(prompt).not.toContain("PAST SCRIPT REFERENCE");
  });

  it("does not render the block when past_scripts is empty", () => {
    const prompt = buildSingleScriptSystemPrompt(
      DNA,
      HOOK,
      undefined,
      null,
      undefined,
      [],
      makeAssets([]),
    );
    expect(prompt).not.toContain("PAST SCRIPT REFERENCE");
  });

  it("renders the block with framework labels when past_scripts are present", () => {
    const prompt = buildSingleScriptSystemPrompt(
      DNA,
      HOOK,
      undefined,
      null,
      undefined,
      [],
      makeAssets([
        {
          asset_type: "past_script",
          title: "Bahamas guy",
          body: "Got a message from this guy in the Bahamas...",
          metadata: { framework: "Hero's Journey" },
        },
      ]),
    );
    expect(prompt).toContain("BEGIN PAST SCRIPT REFERENCE");
    expect(prompt).toContain("Hero's Journey");
    expect(prompt).toContain("Bahamas guy");
    expect(prompt).toContain("Got a message from this guy in the Bahamas");
    expect(prompt).toContain("END PAST SCRIPT REFERENCE");
  });

  it("uses the framework-specific anchor instruction when framework is supplied", () => {
    const prompt = buildSingleScriptSystemPrompt(
      DNA,
      HOOK,
      undefined,
      null,
      undefined,
      [],
      makeAssets([
        {
          asset_type: "past_script",
          title: "Hero example",
          body: "...",
          metadata: { framework: "Hero's Journey" },
        },
      ]),
      "Hero's Journey",
    );
    expect(prompt).toContain("SAME framework you're working in (Hero's Journey)");
  });

  it("uses the multi-framework instruction when framework is omitted", () => {
    const prompt = buildSingleScriptSystemPrompt(
      DNA,
      HOOK,
      undefined,
      null,
      undefined,
      [],
      makeAssets([
        {
          asset_type: "past_script",
          title: "Hero example",
          body: "...",
          metadata: { framework: "Hero's Journey" },
        },
      ]),
    );
    expect(prompt).toContain("Recent past scripts the creator has approved");
    expect(prompt).not.toContain("SAME framework you're working in");
  });

  it("truncates a long past_script body", () => {
    const long = "x".repeat(3000);
    const prompt = buildSingleScriptSystemPrompt(
      DNA,
      HOOK,
      undefined,
      null,
      undefined,
      [],
      makeAssets([
        {
          asset_type: "past_script",
          title: "Long past",
          body: long,
          metadata: { framework: "Hero's Journey" },
        },
      ]),
    );
    expect(prompt).toContain("...");
    expect(prompt).not.toContain(long);
  });
});
