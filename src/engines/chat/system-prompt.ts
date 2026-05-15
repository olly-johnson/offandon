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
import {
  METHODOLOGY_CHAT_SLICE,
  METHODOLOGY_HOUSE,
  renderAdminRulesBlock,
  renderUserMethodologyBlock,
} from "@/lib/shared/methodology";

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
 * Render a relative-date suffix that the model can reason about. Recent
 * facts get human-friendly relatives ("3d ago"); anything older falls
 * back to month-year so the model can still phrase temporal arcs
 * ("you mentioned that back in March").
 *
 * Note: this is a single point-in-time stamp per fact. It does NOT
 * give the model a timeline of how a metric evolved (e.g. 1 -> 3 -> 5
 * paying clients). For that we'd need a separate append-only
 * `creator_events` log; see memory/project_events_log_plan note.
 */
function formatRelativeAge(iso: string, now: Date): string {
  const created = new Date(iso);
  const ms = now.getTime() - created.getTime();
  const day = 86_400_000;
  const days = Math.floor(ms / day);
  if (Number.isNaN(days) || days < 0) return "today";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return created.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Render the Haiku-extracted memories as a compact block the chat model
 * can scan. Grouped by category so it can pull the right facts for the
 * current turn (a script question needs ongoing_project, a voice question
 * needs preference). Each fact carries a relative-age suffix so the
 * model can reason about temporal arcs across multiple facts in the
 * same category. Empty when the user has no memories yet, in which
 * case we skip the whole block to keep the prompt clean.
 */
function renderMemoryBlock(memories: MemoryRow[], now: Date = new Date()): string {
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
      lines.push(`  - ${r.fact} (${formatRelativeAge(r.created_at, now)})`);
    }
  }

  return [
    "",
    "----- BEGIN CREATOR MEMORY (incremental facts from prior chats) -----",
    "Reference these when relevant. Do NOT cite them verbatim or list them back at the creator. Do NOT bring up an ongoing project unless they raise it first.",
    "Each fact is followed by a relative age stamp (today / 3d ago / 2w ago / Mar 2026). Use these to phrase temporal arcs naturally when the creator asks recall-shaped questions; do not read the stamp out loud.",
    "",
    lines.join("\n"),
    "----- END CREATOR MEMORY -----",
  ].join("\n");
}

export function buildChatSystemPrompt(
  voiceDna: VoiceDNA,
  memories: MemoryRow[] = [],
  userMethodology?: string | null,
  methodology?: { house: string; chat: string },
  operatorRules: string[] = [],
): string {
  const house = methodology?.house ?? METHODOLOGY_HOUSE;
  const chat = methodology?.chat ?? METHODOLOGY_CHAT_SLICE;
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
    "----- BEGIN HOUSE METHODOLOGY -----",
    house,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN CHAT METHODOLOGY SLICE -----",
    chat,
    "----- END CHAT METHODOLOGY SLICE -----",
    renderAdminRulesBlock(operatorRules),
    renderUserMethodologyBlock(userMethodology),
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
    "2. When the creator references a specific past artifact that is NOT in the visible history or Creator Memory block — a Fathom call, last week's questionnaire, a story they told you once, a framework they wrote up, a number from a past conversation — call the `search_client_corpus` tool with a tight query in their own words. Read the returned chunks, then answer in your own voice referencing what you found. If the tool returns nothing useful, say so plainly and ask them to fill in the detail. Do NOT call this tool for generic voice/methodology questions or anything answerable from the visible history.",
    "3. Default short. Two to six sentences unless the user asks for more. If they ask for a list, use plain dashes, not numbered lists with structural openers.",
    "4. Stay inside the creator's voice. Match the tone_profile. No hype words, no coach-speak, no motivational filler.",
    "5. Specifics over abstractions. Concrete examples, numbers, named moves. Never end with a generic wrap-up sentence.",
    "6. If the user asks for a hook or script, sound like THEM, not like a generic copywriter. Pillar names are valid context to reference.",
    "7. If the request is unclear AND the history does not resolve it, ask one tight clarifying question and stop. Do not guess and pad.",
    "",
    "Return ONLY the assistant message as plain text. No JSON, no preamble like 'Here is your reply.', and NO markdown formatting of any kind: do not wrap words in **double asterisks** or __underscores__ for bold, do not use ## headings, and do not insert --- horizontal rules between sections. The chat surface renders raw text, so these markers show up literally and look broken.",
  ].join("\n");
}
