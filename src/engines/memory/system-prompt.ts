/**
 * System prompt builder for the Memory Engine (BO-034).
 *
 * The extractor is a small, fast Haiku pass that runs after a chat turn
 * completes. Its job: notice anything the creator said that's worth
 * remembering across future conversations and emit a tiny structured
 * payload. It deliberately under-extracts; we'd rather miss a fact than
 * pollute future prompts with low-value noise.
 *
 * Output contract:
 *   {
 *     "facts": [
 *       { "fact": "<5..30 words>", "category": "ongoing_project|creator_context|preference|recent_topic", "priority": 1..5 }
 *     ]
 *   }
 *
 * Hard limits enforced in the prompt AND validated again on parse:
 *   - max 3 facts per call
 *   - each fact <= 200 chars
 *   - category in the 4-value enum
 *   - priority is an integer 1..5
 */

import type { VoiceDNA } from "@/engines/voice/types";

import type { MemoryRow } from "./persistence";

/** Categories the extractor is allowed to use. Mirrors the DB check constraint. */
export const MEMORY_CATEGORIES = [
  "ongoing_project",
  "creator_context",
  "preference",
  "recent_topic",
] as const;

export const MEMORY_MAX_FACTS_PER_CALL = 3;
export const MEMORY_MAX_FACT_CHARS = 200;

export const MEMORY_SYSTEM_PROMPT = [
  "You are the Memory Skill for Bot OS. Your only job is to extract durable facts about the creator from the most recent chat turn and emit them as JSON.",
  "",
  "You are NOT a chatbot. You do not reply, summarise, or converse. You output JSON and stop.",
  "",
  "What counts as a fact worth saving:",
  '  ongoing_project    Something the creator is actively building, launching, or working through right now. E.g. "Launching a $5K coaching offer over 90 days".',
  '  creator_context    Stable context about their business: model, collaborators, tools, audience details, niche specifics. E.g. "Coaches B2B SaaS founders, not consumer".',
  '  preference         Stated stylistic preferences beyond what is already in Voice DNA. E.g. "Hates the word \\"unlock\\"", "Prefers metaphors from running, not war".',
  "  recent_topic       Short shelf-life mentions: a hook idea they liked, a topic they explored, a thing they tried this week. Priority should be low.",
  "",
  "Rules:",
  "1. Output AT MOST 3 facts. Often 0 or 1. Under-extract.",
  "2. Each fact 5 to 30 words. Specific. No fluff.",
  "3. Do NOT save things already in the existing memory list provided below. Compare semantically, not just literally; reword duplicates do not earn new rows.",
  "4. Do NOT save anything the user denied, retracted, joked about, or said hypothetically.",
  "5. Do NOT save secrets, credentials, contact info, or anything resembling PII.",
  "6. priority is 1..5. Reserve 5 for load-bearing business facts and current launches. 1..2 for recent_topic.",
  "7. If nothing meaningful happened this turn (greetings, small talk, the assistant doing all the talking), return an empty facts array. This is the right answer most of the time.",
  "",
  "Output ONLY a JSON object with this exact shape, nothing else:",
  '  {"facts": [{"fact": "...", "category": "...", "priority": 1}]}',
  "",
  "No prose. No markdown fences. No commentary.",
].join("\n");

export function buildMemoryExtractionUser(args: {
  voiceDna: VoiceDNA;
  existingMemories: MemoryRow[];
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
}): string {
  const dnaSummary = [
    `pillars: ${args.voiceDna.content_pillars.map((p) => p.name).join(" | ")}`,
    `audience: ${args.voiceDna.audience_persona.description}`,
  ].join("\n");

  const existing =
    args.existingMemories.length === 0
      ? "(none)"
      : args.existingMemories
          .map((m) => `- [${m.category}, p${m.priority}] ${m.fact}`)
          .join("\n");

  const transcript = args.recentTurns
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n\n");

  return [
    "----- CREATOR CONTEXT -----",
    dnaSummary,
    "",
    "----- EXISTING MEMORIES (do not duplicate) -----",
    existing,
    "",
    "----- LATEST TURN(S) TO EXTRACT FROM -----",
    transcript,
    "",
    "Return the JSON object now.",
  ].join("\n");
}
