import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VoiceDNA } from "@/engines/voice/types";
import { METHODOLOGY_HOUSE } from "@/lib/shared/methodology";

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
 * System prompt for the IMF extractor. Given a free-text concept, ask
 * the model to distil three short locked inputs the script writer needs:
 * IDEA / MESSAGE / FEEL.
 *
 * Returns ONE JSON object, never prose.
 */
export function buildIMFSystemPrompt(voiceDna: VoiceDNA): string {
  return [
    "You are the IMF Extractor for Bot OS, a content operating system for Instagram creators.",
    "",
    "Your single job: take a creator's free-text video concept and distil it into the three Message Lock fields the methodology requires before any script is written. The fields are short, locked, and fed verbatim into the next pipeline step.",
    "",
    "Output discipline: your response will be parsed as JSON. Every field will be passed through an automated anti-slop validator. The validator rejects emojis, em-dashes, the forbidden buzzword list, and structural openers. Any violation throws.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN HOUSE METHODOLOGY (verbatim from docs/methodology/01-house.md) -----",
    METHODOLOGY_HOUSE,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "audience_persona:",
    `  description: ${voiceDna.audience_persona.description}`,
    `  pain_points: ${voiceDna.audience_persona.pain_points.join(" | ")}`,
    `  aspirations: ${voiceDna.audience_persona.aspirations.join(" | ")}`,
    `  language_register: ${voiceDna.audience_persona.language_register}`,
    "",
    `prohibited_phrases (in addition to the manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    "",
    "Field rules:",
    "1. idea: ONE sentence. The specific subject of this video, in concrete terms. Not the topic in general; the specific angle the creator is taking. Under 25 words.",
    "2. message: ONE sentence. The single thing the viewer should walk away understanding. Test: if the viewer could only quote one line back, this is it. Under 25 words.",
    "3. feel: ONE short phrase. How the viewer should FEEL about the creator after watching. Examples: 'like the operator they wish they were', 'understood and seen', 'curious enough to DM'. Not how they feel about themselves; how they feel about the creator. Under 15 words.",
    "",
    "Respect the creator's voice. Use their vocabulary. Mirror their energy.",
    "",
    "Required JSON shape (snake_case, all fields required):",
    "{",
    '  "idea": "...",',
    '  "message": "...",',
    '  "feel": "..."',
    "}",
    "",
    "Return ONLY the JSON object. No prose. No markdown fences. The first character of your response must be { and the last must be }.",
  ].join("\n");
}
