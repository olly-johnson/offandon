import { describe, expect, it } from "vitest";

import {
  sanitizeExtractedClientData,
  sanitizeString,
  sanitizeValue,
} from "./sanitize";
import type { ExtractedClientData } from "./types";

describe("sanitizeString", () => {
  it("replaces em-dashes with comma + space", () => {
    expect(sanitizeString("Trust is currency — every desire is downstream.")).toBe(
      "Trust is currency, every desire is downstream.",
    );
  });

  it("replaces en-dashes between words with comma + space", () => {
    expect(sanitizeString("Authentic – not performative.")).toBe(
      "Authentic, not performative.",
    );
  });

  it("collapses double spaces created by replacement", () => {
    expect(sanitizeString("A  —  B")).toBe("A, B");
  });

  it("leaves text without em/en dashes unchanged", () => {
    const input = "Plain text with no special punctuation.";
    expect(sanitizeString(input)).toBe(input);
  });

  it("does not break number ranges like 2026-05-12", () => {
    expect(sanitizeString("Date: 2026-05-12")).toBe("Date: 2026-05-12");
  });
});

describe("sanitizeValue", () => {
  it("walks nested objects + arrays + primitives", () => {
    const input = {
      a: "x — y",
      b: ["one — two", { c: "three — four" }],
      d: 42,
      e: null,
      f: true,
    };
    expect(sanitizeValue(input)).toEqual({
      a: "x, y",
      b: ["one, two", { c: "three, four" }],
      d: 42,
      e: null,
      f: true,
    });
  });

  it("does not mutate the input", () => {
    const input = { v: "x — y" };
    sanitizeValue(input);
    expect(input.v).toBe("x — y");
  });
});

describe("sanitizeExtractedClientData", () => {
  it("scrubs em-dashes from every string in the artifact", () => {
    const data: ExtractedClientData = {
      profile: { display_name: "Alex — Shaw" },
      voice_dna: {
        tone_profile: {
          primary: "grounded — direct",
          energy: "high",
          formality: "conversational",
          descriptors: ["grounded — calm"],
        },
        content_pillars: [
          {
            name: "Identity — Authenticity",
            description: "Who you are — online vs offline.",
            example_topics: ["A — B"],
          },
        ],
        prohibited_phrases: ["leverage — synergy"],
        audience_persona: {
          description: "Founders — stuck on content.",
          pain_points: ["Crickets — no DMs"],
          aspirations: ["Inbound — clients"],
          language_register: "operator — to — operator",
        },
        generated_at: "2026-05-12T00:00:00.000Z",
        source_questionnaire_hash: "ingestion",
      },
      source_answers: {
        niche: "B2B founders — solo",
        business_description: "ABS — Authentic Brand Storytelling",
        goals: ["25k — followers"],
        voice_samples: ["Sample — one"],
        what_works: "Vulnerability — earns trust.",
        where_stuck: "Hooks — not landing.",
        icp: {
          pain_points: ["No leads — from content"],
          desires: ["Inbound — clients"],
          thoughts_at_2am: ["Am I real — or a fraud?"],
          internal_battles: ["Want to be seen — terrified."],
          dreams: ["One-of-one — brand"],
        },
        positioning: {
          core_philosophy: "Trust — the most valuable currency.",
          contrarian_belief: "Posting more — is not the answer.",
          differentiator: "Documenting — not teaching.",
        },
      },
      client_assets: [
        {
          asset_type: "story",
          title: "Rock bottom — Mexico",
          body: "FUCK IT — I can't keep living like this.",
          metadata: { category: "rock_bottom", funnel_fit: "top" },
          source_file: "story_bank.md#rock-bottom",
        },
      ],
      user_memories: [
        {
          fact: "Building Game of Life — Season 2.",
          category: "ongoing_project",
          priority: 4,
        },
      ],
      user_methodology: "TOF CTA: 'Just the player — not the guru.'",
    };

    const out = sanitizeExtractedClientData(data);

    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain("—");

    // Spot-check a few specific fields kept their content (minus dashes).
    expect(out.voice_dna.audience_persona.description).toBe(
      "Founders, stuck on content.",
    );
    expect(out.client_assets[0].body).toBe(
      "FUCK IT, I can't keep living like this.",
    );
    expect(out.user_methodology).toBe(
      "TOF CTA: 'Just the player, not the guru.'",
    );

    // Stable identifiers (asset_type, category) untouched.
    expect(out.client_assets[0].asset_type).toBe("story");
    expect(out.user_memories[0].category).toBe("ongoing_project");
  });
});
