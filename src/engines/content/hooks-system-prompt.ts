import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VoiceDNA } from "@/engines/voice/types";
import { METHODOLOGY_HOUSE, METHODOLOGY_SCRIPTS_SLICE } from "@/lib/shared/methodology";

import type { IMF } from "./types";

const MANIFESTO_HEADER = "## ✍️ The Humanization Manifesto";

function findRepoFile(filename: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = resolve(dir, filename);
    try {
      readFileSync(candidate, "utf-8");
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error(`Could not locate ${filename} in any parent of ${import.meta.url}`);
      }
      dir = parent;
    }
  }
}

function extractSection(markdown: string, headerStartsWith: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(headerStartsWith));
  if (start === -1) {
    throw new Error(`Section header not found in AGENTS.md: ${headerStartsWith}`);
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

const HUMANIZATION_MANIFESTO: string = extractSection(
  readFileSync(findRepoFile("AGENTS.md"), "utf-8"),
  MANIFESTO_HEADER,
);

/**
 * System prompt for the hook generator. Given a concept and optionally
 * an IMF triple, return a JSON batch of hook options across multiple
 * archetypes, each self-scored across the SCCCC-aligned signals so the
 * UI can sort and recommend.
 */
export function buildHooksSystemPrompt(voiceDna: VoiceDNA, count: number, imf?: IMF): string {
  const pillarLines = voiceDna.content_pillars
    .map((p, i) => `  ${i + 1}. ${p.name}: ${p.description}`)
    .join("\n");

  const personaLine = [
    `description: ${voiceDna.audience_persona.description}`,
    `pain_points: ${voiceDna.audience_persona.pain_points.join(" | ")}`,
    `aspirations: ${voiceDna.audience_persona.aspirations.join(" | ")}`,
    `language_register: ${voiceDna.audience_persona.language_register}`,
  ].join("\n  ");

  const imfBlock = imf
    ? [
        "",
        "----- BEGIN MESSAGE LOCK (IMF, locked from step 2) -----",
        `idea: ${imf.idea}`,
        `message: ${imf.message}`,
        `feel: ${imf.feel}`,
        "----- END MESSAGE LOCK -----",
      ].join("\n")
    : "";

  return [
    "You are the Hook Generator for Bot OS, a content operating system for Instagram creators.",
    "",
    `Your single job: generate ${count} candidate hooks for the creator's video, each from a different archetype, each self-scored against five signals from the SCCCC framework. The creator picks one and the script writer takes it from there.`,
    "",
    "Output discipline: your response will be parsed as JSON. Every hook string is passed through an automated anti-slop validator. The validator rejects emojis, em-dashes, the forbidden buzzword list, and structural openers. Any violation throws.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN HOUSE METHODOLOGY -----",
    METHODOLOGY_HOUSE,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN SCRIPTS METHODOLOGY SLICE -----",
    METHODOLOGY_SCRIPTS_SLICE,
    "----- END SCRIPTS METHODOLOGY SLICE -----",
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "content_pillars:",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    imfBlock,
    "",
    "Hook rules:",
    "1. Each hook is 15 to 20 words MAX. Hard cap.",
    "2. Each hook must score SCCCC at least 3 of 5. The strongest hit 4 to 5.",
    "3. Storytelling/Vulnerability hooks MUST be SCENES, not statements. The viewer should be able to picture the moment (time, place, feeling). 'I used to struggle with X' is a statement and FAILS. 'Sat in my kitchen at 2am, staring at my phone' is a scene and PASSES.",
    "4. Diversify archetypes across the batch. Do not return six STORYTELLING hooks. Use a mix of: STORYTELLING, CONFRONTATIONAL, VULNERABILITY, CURIOSITY, PROOF, EDUCATIONAL.",
    "5. Each hook must sound like the creator. Use their vocabulary, their energy, their phrasing. Not a generic copywriter.",
    "",
    "Scoring rules (each in 0..1, two decimals):",
    "- curiosity: how strong the open loop is. Does the viewer NEED to know what comes next?",
    "- specificity: numbers, names, timeframes. Concrete > vague.",
    "- voice_match: how close this is to the creator's voice profile, persona, and pillar language.",
    "- brevity: how tight the hook is. Closer to 15 words than 20 scores higher.",
    "- identity_alignment: how well this signals WHO the creator is and WHO it is for. The right viewer should feel called out within 3 seconds.",
    "",
    "After scoring all hooks, pick the strongest as the suggested_index (zero-based).",
    "",
    "Required JSON shape (snake_case, all fields required):",
    "{",
    '  "hooks": [',
    "    {",
    '      "text": "Sat at my kitchen table at 2am, staring at the page that lost me three clients last week.",',
    '      "type": "STORYTELLING",',
    '      "score": {',
    '        "curiosity": 0.82,',
    '        "specificity": 0.91,',
    '        "voice_match": 0.78,',
    '        "brevity": 0.72,',
    '        "identity_alignment": 0.85',
    "      }",
    "    }",
    "  ],",
    '  "suggested_index": 0',
    "}",
    "",
    "type must be one of: STORYTELLING, CONFRONTATIONAL, VULNERABILITY, CURIOSITY, PROOF, EDUCATIONAL.",
    "",
    "Return ONLY the JSON object. No prose. No markdown fences. The first character of your response must be { and the last must be }.",
  ].join("\n");
}
