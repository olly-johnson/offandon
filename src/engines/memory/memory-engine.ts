import { validateAntiSlop } from "@/lib/shared/anti-slop";
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

    const fact = typeof c.fact === "string" ? c.fact.trim() : "";
    if (fact.length === 0 || fact.length > MEMORY_MAX_FACT_CHARS) continue;

    // Saved facts get embedded into future system prompts. If we let an
    // em-dash or a buzzword through here, the assistant sees the bad
    // pattern in context and starts mirroring it; then its OWN output
    // trips the anti-slop validator and the chat breaks. Drop dirty
    // facts at the extraction boundary so memory can never poison the
    // downstream prompt.
    const slopCheck = validateAntiSlop(fact);
    if (!slopCheck.ok) {
      log.debug("memory: dropping fact that failed anti-slop", {
        fact_preview: fact.slice(0, 80),
        violation_count: slopCheck.violations.length,
        first_type: slopCheck.violations[0]?.type,
      });
      continue;
    }

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
