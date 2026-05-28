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
import {
  hasCorpusHits,
  type ScriptsCorpusContext,
} from "./corpus-context";

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

/**
 * Single asset body cap (chars). Keeps a long story or methodology
 * dump from monopolising prompt budget. Chosen so a typical 500-char
 * story renders in full and a 2000-char essay clips to a paragraph.
 */
const ASSET_BODY_RENDER_CAP = 700;

function truncateForPrompt(s: string): string {
  if (s.length <= ASSET_BODY_RENDER_CAP) return s;
  return `${s.slice(0, ASSET_BODY_RENDER_CAP).trimEnd()}...`;
}

export function renderClientAssetsBlock(ctx: ScriptAssetsContext | null | undefined): string {
  if (!hasAnyAssets(ctx)) return "";

  const c = ctx!;
  const lines: string[] = [];

  lines.push("");
  lines.push("----- BEGIN CREATOR'S OWN MATERIAL -----");
  lines.push(
    "Operator-curated reference material the creator has approved. Draw from it to ground each script in real moments, real language, and proven hook structures. Reference by title when adapting a story or pattern. Do not invent stories or quotes that are not represented here or in the voice samples.",
  );

  if (c.stories.length > 0) {
    lines.push("");
    lines.push("[stories — verbatim creator material; quote or paraphrase only what fits]");
    c.stories.forEach((s, i) => {
      const meta = (s.metadata?.category ?? "") as string;
      const funnel = (s.metadata?.funnel_fit ?? "") as string;
      const tag =
        meta || funnel
          ? ` (${[meta, funnel].filter((x) => x).join(", ")})`
          : "";
      lines.push(`  ${i + 1}. "${s.title}"${tag}`);
      lines.push(`     ${truncateForPrompt(s.body)}`);
    });
  }

  if (c.viral_references.length > 0) {
    lines.push("");
    lines.push("[viral_references — external structures that work for this audience]");
    c.viral_references.forEach((v, i) => {
      const creator = (v.metadata?.creator ?? "") as string;
      const tag = creator ? ` (by ${creator})` : "";
      lines.push(`  ${i + 1}. "${v.title}"${tag}`);
      lines.push(`     ${truncateForPrompt(v.body)}`);
    });
  }

  if (c.templates.length > 0) {
    lines.push("");
    lines.push("[templates — hook / structure patterns the creator likes]");
    c.templates.forEach((t, i) => {
      lines.push(`  ${i + 1}. "${t.title}"`);
      lines.push(`     ${truncateForPrompt(t.body)}`);
    });
  }

  if (c.past_scripts.length > 0) {
    lines.push("");
    lines.push(
      "[past_scripts — creator's own published pieces, labelled by framework. When you write a script in framework X, prefer the past_script tagged X as your structural anchor.]",
    );
    c.past_scripts.forEach((p, i) => {
      const fw = typeof p.metadata?.framework === "string" ? p.metadata.framework : "";
      const tag = fw ? ` [framework: ${fw}]` : "";
      lines.push(`  ${i + 1}. "${p.title}"${tag}`);
      lines.push(`     ${truncateForPrompt(p.body)}`);
    });
  }

  lines.push("----- END CREATOR'S OWN MATERIAL -----");
  return lines.join("\n");
}

/**
 * Render the corpus retrieval block (BO-051). Distinct from the operator-
 * curated client_assets block above:
 *   - client_assets is a small, hand-tuned reference set the operator
 *     promoted as canonical voice anchors.
 *   - corpus hits are top-k vector-search results over the full long-form
 *     archive — fresher and broader, but the model should treat them as
 *     RAW transcript / questionnaire excerpts, not approved samples.
 *
 * Each hit carries its source type + document title + capture date so
 * the model can phrase references naturally ("on a recent call you
 * said..." vs "in last week's check-in...").
 */
export function renderCorpusContextBlock(ctx: ScriptsCorpusContext | null | undefined): string {
  if (!hasCorpusHits(ctx)) return "";
  const hits = ctx!.hits;
  const lines: string[] = [];
  lines.push("");
  lines.push("----- BEGIN CREATOR'S CORPUS (recent recorded conversations + questionnaires) -----");
  lines.push(
    "Top-k chunks retrieved from the creator's long-form archive — Fathom call transcripts, weekly questionnaire answers, long-form notes. Use these to ground each script in real moments, real numbers, and real language the creator has used recently. Reference them implicitly (do NOT cite source IDs or capture dates literally in scripts) and do NOT invent details beyond what is represented here or in the voice samples.",
  );
  hits.forEach((h, i) => {
    lines.push("");
    lines.push(
      `[${i + 1}] ${h.source_type} | "${h.document_title}" | captured ${h.captured_at.slice(0, 10)}`,
    );
    lines.push(`    ${truncateForPrompt(h.chunk_text.trim())}`);
  });
  lines.push("----- END CREATOR'S CORPUS -----");
  return lines.join("\n");
}

export function buildScriptsSystemPrompt(
  voiceDna: VoiceDNA,
  userMethodology?: string | null,
  clientAssets?: ScriptAssetsContext | null,
  methodology?: { house: string; scripts: string },
  operatorRules: string[] = [],
  corpusContext?: ScriptsCorpusContext | null,
): string {
  const house = methodology?.house ?? METHODOLOGY_HOUSE;
  const scripts = methodology?.scripts ?? METHODOLOGY_SCRIPTS_SLICE;
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
    "content_pillars (each script MUST ladder up to one of these by name):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the Humanization Manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    renderClientAssetsBlock(clientAssets),
    renderCorpusContextBlock(corpusContext),
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
