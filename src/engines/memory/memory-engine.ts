import { createLogger } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import type { ExtractedFact, MemoryCategory, MemoryRow } from "./persistence";
import {
  buildMemoryExtractionUser,
  MEMORY_CATEGORIES,
  MEMORY_MAX_FACTS_PER_CALL,
  MEMORY_MAX_FACT_CHARS,
  MEMORY_SYSTEM_PROMPT,
} from "./system-prompt";

const log = createLogger("memory.engine");

const CATEGORY_SET = new Set<MemoryCategory>(MEMORY_CATEGORIES);

export interface MemoryExtractInput {
  voiceDna: VoiceDNA;
  existingMemories: MemoryRow[];
  /**
   * The most recent user+assistant exchange we want to extract from.
   * Usually two messages (one user, one assistant). The engine does not
   * extract from older history; that's already been seen.
   */
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface MemoryExtractResult {
  facts: ExtractedFact[];
}

export interface MemoryEngineOptions {
  llm: ILLMClient;
}

/**
 * Lightweight post-chat extractor. Calls Haiku with a structured-JSON
 * prompt, parses the output, drops anything malformed or out-of-bounds.
 * Returns an empty facts array on parse failure rather than throwing;
 * memory extraction is best-effort and must never break the chat flow.
 */
export class MemoryEngine {
  private readonly llm: ILLMClient;

  constructor(opts: MemoryEngineOptions) {
    this.llm = opts.llm;
  }

  async extract(input: MemoryExtractInput): Promise<MemoryExtractResult> {
    if (input.recentTurns.length === 0) {
      return { facts: [] };
    }

    const user = buildMemoryExtractionUser({
      voiceDna: input.voiceDna,
      existingMemories: input.existingMemories,
      recentTurns: input.recentTurns,
    });

    let raw: string;
    try {
      raw = await this.llm.complete({
        system: MEMORY_SYSTEM_PROMPT,
        user,
      });
    } catch (err) {
      log.warn("memory extractor LLM call failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return { facts: [] };
    }

    return { facts: parseExtractedFacts(raw) };
  }
}

/**
 * Strip the patterns that, if persisted into memory, would leak into
 * future system prompts and cause the chat assistant to mirror them
 * (and then fail its own anti-slop validator).
 *
 *   em-dash (U+2014) -> period + space
 *   emojis           -> dropped entirely
 *
 * Buzzwords are not stripped: you can't surgically remove "leverage"
 * without mangling the sentence. The chat system prompt's own rules
 * already keep them out of assistant output.
 */
export function sanitizeFactText(s: string): string {
  return s
    .replace(/—/g, ". ")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parse the model's JSON output into validated ExtractedFact[]. Tolerant of
 * lightly-malformed input (extra prose, surrounding whitespace) but strict
 * on the shape of each fact: category must be in the enum, priority must
 * be an integer 1..5, fact must be a non-empty string under the char cap.
 *
 * Hard caps to MEMORY_MAX_FACTS_PER_CALL. Silently drops anything that
 * doesn't pass; never throws. Memory is best-effort.
 */
export function parseExtractedFacts(raw: string): ExtractedFact[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Tolerate prose wrappers by extracting the first {...} block.
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) {
      log.debug("memory: could not find JSON object in output");
      return [];
    }
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      log.debug("memory: JSON parse failed even after slicing");
      return [];
    }
  }

  if (!parsed || typeof parsed !== "object") return [];
  const facts = (parsed as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return [];

  const out: ExtractedFact[] = [];
  for (const candidate of facts) {
    if (out.length >= MEMORY_MAX_FACTS_PER_CALL) break;
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Record<string, unknown>;

    const rawFact = typeof c.fact === "string" ? c.fact.trim() : "";
    if (rawFact.length === 0 || rawFact.length > MEMORY_MAX_FACT_CHARS) continue;

    // Sanitize before save instead of dropping. Saved facts get embedded
    // into future system prompts; if an em-dash survives here the chat
    // assistant mirrors it in its own output and trips the downstream
    // anti-slop validator. Sanitizing keeps the useful content while
    // neutering the patterns that would poison the next prompt.
    // Buzzwords are NOT stripped (you can't surgically remove "leverage"
    // without breaking the sentence); we trust the chat system prompt's
    // own anti-slop rules to keep them out of assistant output.
    const fact = sanitizeFactText(rawFact);
    if (fact.length === 0) continue;

    const category =
      typeof c.category === "string" && CATEGORY_SET.has(c.category as MemoryCategory)
        ? (c.category as MemoryCategory)
        : null;
    if (!category) continue;

    const rawPriority =
      typeof c.priority === "number" && Number.isFinite(c.priority) ? c.priority : 3;
    const priority = Math.max(1, Math.min(5, Math.round(rawPriority)));

    out.push({ fact, category, priority });
  }
  return out;
}
