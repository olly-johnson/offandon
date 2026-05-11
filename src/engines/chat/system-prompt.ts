/**
 * System prompt builder for the Chat Engine.
 *
 * Same load-from-AGENTS.md pattern as the Voice and Content engines: the
 * Humanization Manifesto is pulled at module-load and embedded verbatim in
 * the prompt. If the section header is renamed in AGENTS.md, this module
 * throws and the engine refuses to run until the bug is fixed.
 *
 * Unlike the script generator, the chat engine returns plain prose. The
 * anti-slop validator runs on that prose and rejects any manifesto
 * violations before the reply is shown to the user.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { MemoryRow } from "@/engines/memory/persistence";
import type { VoiceDNA } from "@/engines/voice/types";
import { METHODOLOGY_CHAT_SLICE, METHODOLOGY_HOUSE } from "@/lib/shared/methodology";

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
 * Render the Haiku-extracted memories as a compact block the chat model
 * can scan. Grouped by category so it can pull the right facts for the
 * current turn (a script question needs ongoing_project, a voice question
 * needs preference). Empty when the user has no memories yet, in which
 * case we skip the whole block to keep the prompt clean.
 */
function renderMemoryBlock(memories: MemoryRow[]): string {
  if (memories.length === 0) return "";

  const order: MemoryRow["category"][] = [
    "ongoing_project",
    "creator_context",
    "preference",
    "recent_topic",
  ];

  const grouped = new Map<MemoryRow["category"], MemoryRow[]>();
  for (const cat of order) grouped.set(cat, []);
  for (const m of memories) {
    grouped.get(m.category)?.push(m);
  }

  const lines: string[] = [];
  for (const cat of order) {
    const rows = grouped.get(cat) ?? [];
    if (rows.length === 0) continue;
    lines.push(`${cat}:`);
    for (const r of rows) {
      lines.push(`  - ${r.fact}`);
    }
  }

  return [
    "",
    "----- BEGIN CREATOR MEMORY (incremental facts from prior chats) -----",
    "Reference these when relevant. Do NOT cite them verbatim or list them back at the creator. Do NOT bring up an ongoing project unless they raise it first.",
    "",
    lines.join("\n"),
    "----- END CREATOR MEMORY -----",
  ].join("\n");
}

export function buildChatSystemPrompt(
  voiceDna: VoiceDNA,
  memories: MemoryRow[] = [],
): string {
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
    "You are the Chat Skill for Bot OS, a content operating system for Instagram creators.",
    "",
    "Your job: act as a peer-level operator the creator can think out loud with. They want short, useful, specific replies grounded in their voice. Help them sharpen hooks, pressure-test angles, plan a week of content, or talk through a stuck launch. Do not lecture, do not summarize back what they said, do not pad.",
    "",
    "Output discipline: you reply in plain prose, in the creator's voice. Every reply is passed through an automated anti-slop validator. The validator rejects emojis, em-dashes, the forbidden buzzword list, and structural fillers. Any violation throws and the user sees a failure. Take it seriously.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN HOUSE METHODOLOGY (verbatim from docs/methodology/01-house.md) -----",
    METHODOLOGY_HOUSE,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN CHAT METHODOLOGY SLICE (verbatim from docs/methodology/02-chat.md) -----",
    METHODOLOGY_CHAT_SLICE,
    "----- END CHAT METHODOLOGY SLICE -----",
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "content_pillars (the creator owns these territories):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the Humanization Manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    renderMemoryBlock(memories),
    "",
    "Reply rules:",
    "1. The conversation history IS your data. Treat every prior user turn in the thread as an authoritative fact the creator has told you about themselves and their work. When they ask 'what did I say about X', 'remind me what...', 'what did my client buy', 'what's my goal' or similar recall questions, look back at the history and answer directly from it. NEVER reply with 'I don't have data about your clients/business/past' when the answer is in the visible history. If genuinely nothing in history covers the question, say so explicitly and ask them to fill in the gap.",
    "2. Default short. Two to six sentences unless the user asks for more. If they ask for a list, use plain dashes, not numbered lists with structural openers.",
    "3. Stay inside the creator's voice. Match the tone_profile. No hype words, no coach-speak, no motivational filler.",
    "4. Specifics over abstractions. Concrete examples, numbers, named moves. Never end with a generic wrap-up sentence.",
    "5. If the user asks for a hook or script, sound like THEM, not like a generic copywriter. Pillar names are valid context to reference.",
    "6. If the request is unclear AND the history does not resolve it, ask one tight clarifying question and stop. Do not guess and pad.",
    "",
    "Return ONLY the assistant message as plain text. No JSON, no markdown headers, no preamble like 'Here is your reply.'",
  ].join("\n");
}
