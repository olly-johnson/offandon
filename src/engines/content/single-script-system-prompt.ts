import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { VoiceDNA } from "@/engines/voice/types";
import {
  METHODOLOGY_HOUSE,
  METHODOLOGY_SCRIPTS_SLICE,
  renderAdminRulesBlock,
  renderUserMethodologyBlock,
} from "@/lib/shared/methodology";

import {
  hasAnyAssets,
  type ScriptAssetsContext,
} from "./client-assets-persistence";
import type { IMF } from "./types";

const PAST_SCRIPT_RENDER_CAP = 1500;

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
 * System prompt for the single-script generator. Given the locked
 * concept + IMF + chosen hook, write ONE finished script body that
 * delivers on the hook's promise and lands the IMF message.
 */
/**
 * Render past_scripts as a focused reference block (BO-053). When the
 * caller filters to a single framework (via `framework`), the block
 * shows just that matching past piece. When unfiltered, it renders
 * whatever framework-grouped set the loader returned. Empty input
 * skips the block.
 *
 * Cap is bigger than the batch generator's because a single-script
 * surface only renders one or two references max, so we can afford to
 * show more of each.
 */
function renderPastScriptReferenceBlock(
  clientAssets: ScriptAssetsContext | null | undefined,
  framework?: string,
): string {
  if (!hasAnyAssets(clientAssets) || clientAssets!.past_scripts.length === 0) {
    return "";
  }
  const past = clientAssets!.past_scripts;
  const lines: string[] = [];
  lines.push("");
  lines.push("----- BEGIN PAST SCRIPT REFERENCE -----");
  lines.push(
    framework
      ? `The creator has written this past script in the SAME framework you're working in (${framework}). Use it as your structural anchor: match the cadence, length of beats, hook→story→lesson→close shape, and language register. Do NOT copy phrasing verbatim — the new script must be its own piece on the new IMF.`
      : "Recent past scripts the creator has approved, labelled by framework. Use whichever matches the framework you're writing in as your structural anchor. Do NOT copy phrasing verbatim.",
  );
  past.forEach((p, i) => {
    const fw = typeof p.metadata?.framework === "string" ? p.metadata.framework : "";
    const tag = fw ? ` [framework: ${fw}]` : "";
    lines.push("");
    lines.push(`${i + 1}. "${p.title}"${tag}`);
    const body = p.body.length > PAST_SCRIPT_RENDER_CAP
      ? `${p.body.slice(0, PAST_SCRIPT_RENDER_CAP).trimEnd()}...`
      : p.body;
    lines.push(body);
  });
  lines.push("----- END PAST SCRIPT REFERENCE -----");
  return lines.join("\n");
}

export function buildSingleScriptSystemPrompt(
  voiceDna: VoiceDNA,
  hook: string,
  imf?: IMF,
  userMethodology?: string | null,
  methodology?: { house: string; scripts: string },
  operatorRules: string[] = [],
  clientAssets?: ScriptAssetsContext | null,
  framework?: string,
): string {
  const house = methodology?.house ?? METHODOLOGY_HOUSE;
  const scripts = methodology?.scripts ?? METHODOLOGY_SCRIPTS_SLICE;
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
        "----- BEGIN MESSAGE LOCK (IMF) -----",
        `idea: ${imf.idea}`,
        `message: ${imf.message}`,
        `feel: ${imf.feel}`,
        "----- END MESSAGE LOCK -----",
      ].join("\n")
    : "";

  return [
    "You are the Single Script Generator for Bot OS, a content operating system for Instagram creators.",
    "",
    "Your single job: write ONE finished short-form video script that opens with the locked hook, lands the IMF message, and sounds like the creator wrote it.",
    "",
    "Output discipline: your response will be parsed as JSON. Every user-facing string is anti-slop validated. Em-dashes, emojis, forbidden buzzwords, structural openers all throw.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN HOUSE METHODOLOGY -----",
    house,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN SCRIPTS METHODOLOGY SLICE -----",
    scripts,
    "----- END SCRIPTS METHODOLOGY SLICE -----",
    renderAdminRulesBlock(operatorRules),
    renderUserMethodologyBlock(userMethodology),
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "content_pillars (the script must ladder up to ONE of these by name):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    renderPastScriptReferenceBlock(clientAssets, framework),
    imfBlock,
    "",
    "----- BEGIN LOCKED HOOK (use verbatim as the script's opening; do not rewrite) -----",
    hook,
    "----- END LOCKED HOOK -----",
    "",
    "Script rules (hard):",
    "1. Use the locked hook verbatim as the first line of the body.",
    "2. body length: 180 to 250 words. Hard cap.",
    "3. structure: Hook -> Story (40 to 50% MAX) -> Lesson -> Close + CTA. The story serves the lesson.",
    "4. Sentences max ~12 words where possible. Conversational rhythm.",
    "5. Use at least 3 of the 6 Connection Points (Embedded Truths, Mirror Thinking, Negative Frame, Loop Opener, Contrast Words, Term Branding for MOF/BOF only).",
    "6. CTA matches the funnel stage you choose. TOF soft. MOF value-exchange. BOF direct.",
    "7. Sound like the creator. Match tone_profile. Mirror the audience_persona language register. Do not invent jargon they would not use.",
    "8. NEVER fabricate clients, results, or transformations. If you reference a story, it must be plausibly the creator's based on the IMF.",
    "",
    "Required JSON shape (snake_case, all fields required):",
    "{",
    '  "hook": "...the locked hook verbatim...",',
    '  "body": "...the rest of the script, separated from the hook by a blank line...",',
    '  "pillar": "Operator Frameworks",',
    '  "angle": "story",',
    '  "word_count": 213',
    "}",
    "",
    "angle must be one of: pain_point, aspiration, contrarian, case_study, framework, story, myth_buster.",
    "pillar must EXACTLY match one of the creator's content_pillars by name.",
    "word_count is the integer number of words in the body (not the hook).",
    "",
    "Return ONLY the JSON object. No prose. No markdown fences. The first character of your response must be { and the last must be }.",
  ].join("\n");
}
