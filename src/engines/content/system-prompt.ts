/**
 * System prompt builder for the Content Engine's script generator.
 *
 * Same load-from-AGENTS.md pattern as the Voice Engine: the manifesto is
 * pulled at module-load and embedded verbatim. If the section header is
 * renamed in AGENTS.md, this module throws and the engine refuses to run
 * until the bug is fixed.
 *
 * The user's VoiceDNA is injected into the prompt so Claude has the full
 * tone/pillars/persona context for every generation.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VoiceDNA } from "@/engines/voice/types";

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

export const HUMANIZATION_MANIFESTO: string = extractSection(
  readFileSync(findRepoFile("AGENTS.md"), "utf-8"),
  MANIFESTO_HEADER,
);

export function buildScriptsSystemPrompt(voiceDna: VoiceDNA): string {
  const pillarLines = voiceDna.content_pillars
    .map(
      (p, i) =>
        `  ${i + 1}. ${p.name}: ${p.description} (example angles: ${p.example_topics.join(", ")})`,
    )
    .join("\n");

  const personaLine = [
    `description: ${voiceDna.audience_persona.description}`,
    `pain_points: ${voiceDna.audience_persona.pain_points.join(" | ")}`,
    `aspirations: ${voiceDna.audience_persona.aspirations.join(" | ")}`,
    `language_register: ${voiceDna.audience_persona.language_register}`,
  ].join("\n  ");

  return [
    "You are the Script Generator for Bot OS, a content engine for Instagram creators.",
    "",
    "Your job: produce a batch of short-form video scripts (think Instagram Reels) that sound like the creator wrote them, target their audience, and ladder up to their owned content pillars. Each script must be defensible, specific, and post-ready.",
    "",
    "Output discipline: your response will be parsed as JSON, and every user-facing string will be passed through an automated anti-slop validator. The validator rejects emojis, em-dashes, the forbidden buzzword list, and structural openers. Any violation throws and the user sees a failure. Take it seriously.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "content_pillars (each script MUST ladder up to one of these by name):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the Humanization Manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    "",
    "Rules for each script:",
    "1. hook: 1 to 2 sentences, ideally under 30 words. Stops the scroll. Specific, not generic.",
    "2. body: roughly 50 to 150 words. Delivers the value the hook promised. No filler intro. Land the point and exit.",
    "3. pillar: name of the content_pillar above that this script ladders up to. Exact match.",
    "4. angle: one of pain_point, aspiration, contrarian, case_study, framework, story, myth_buster.",
    "",
    "Rules for the batch as a whole:",
    "1. Diversify angles. Do not return seven pain_point hooks. Aim for at least 4 distinct angles across the batch.",
    "2. Spread across pillars. If the creator has 5 pillars and you produce 7 scripts, every pillar appears at least once.",
    "3. No two hooks share the same opening structure. Vary sentence length, register, and rhetorical move.",
    "4. Treat the audience like operators, not learners. Specifics over abstractions. Numbers over adjectives.",
    "",
    "Required JSON shape (snake_case keys, all fields required):",
    "{",
    '  "scripts": [',
    "    {",
    '      "hook": "Most coaches lose leads at the same point. It is not their offer.",',
    '      "body": "It is the call. ...",',
    '      "pillar": "Operator Frameworks",',
    '      "angle": "pain_point"',
    "    }",
    "  ]",
    "}",
    "",
    "Return ONLY the JSON object. No prose. No markdown fences. The first character of your response must be { and the last must be }.",
  ].join("\n");
}
