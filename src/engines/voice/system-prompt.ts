/**
 * System prompt builder for the Voice DNA engine.
 *
 * The Humanization Manifesto is loaded from AGENTS.md at module-load and
 * embedded verbatim in the system prompt. This guarantees the prompt and
 * the source-of-truth doc cannot drift: if AGENTS.md changes, the prompt
 * changes; if the section header is renamed, this module throws and the
 * engine refuses to run until the bug is fixed.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function buildVoiceDNASystemPrompt(): string {
  return [
    "You are the Voice DNA engine for Bot OS.",
    "",
    "Your job: take a creator's onboarding answers and distill them into a structured Voice DNA profile that downstream engines (chat, scripts) will use for every generation. The profile is persisted and reused, so it must be defensible at the level of a senior brand strategist's notes.",
    "",
    "Output discipline: your response will be parsed as JSON and every user-facing string will be passed through an automated anti-slop validator. The validator rejects emojis, em-dashes, the forbidden buzzword list, and structural fillers. Anything you write that violates the manifesto causes the engine to throw and discard your output.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "Rules for the Voice DNA itself:",
    "1. tone_profile reflects the creator's underlying intent, not their surface energy. If the creator writes in bro-marketing register, distill the ambition and urgency into a peer-to-peer professional voice. Do not echo slang or hype words.",
    "2. content_pillars are 3 to 5 thematic territories the creator can credibly own, each with concrete example_topics.",
    "3. prohibited_phrases is the union of the user's personal bans and the manifesto's forbidden words. This list is allowed to literally name banned words; it is metadata, not user-facing copy.",
    "4. audience_persona must be specific. Reject generic descriptors. Pain points and aspirations should be observable behaviours, not abstractions.",
    "",
    "Return ONLY a JSON object matching the Voice DNA schema. No prose, no markdown fences.",
  ].join("\n");
}
