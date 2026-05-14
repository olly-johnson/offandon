import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";

import { buildHooksSystemPrompt } from "./hooks-system-prompt";
import type {
  GeneratedHook,
  GeneratedHookBatch,
  GenerateHooksInput,
  HookScore,
  HookType,
  IHookGenerator,
} from "./types";

const log = createLogger("content.hook-generator");

const VALID_TYPES: ReadonlySet<HookType> = new Set([
  "STORYTELLING",
  "CONFRONTATIONAL",
  "VULNERABILITY",
  "CURIOSITY",
  "PROOF",
  "EDUCATIONAL",
]);

const SCORE_KEYS = [
  "curiosity",
  "specificity",
  "voice_match",
  "brevity",
  "identity_alignment",
] as const;

export interface HookGeneratorOptions {
  llm: ILLMClient;
  now?: () => Date;
}

export class HookGenerator implements IHookGenerator {
  private readonly llm: ILLMClient;
  private readonly now: () => Date;

  constructor(opts: HookGeneratorOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async generateHooks(input: GenerateHooksInput): Promise<GeneratedHookBatch> {
    const count = input.count ?? 6;
    if (count < 4 || count > 8) {
      throw new Error(`HookGenerator: count must be 4..8, got ${count}`);
    }
    const concept = input.concept.trim();
    if (concept.length < 8) {
      throw new Error("HookGenerator: concept too short (need at least 8 chars)");
    }

    const ctx = input.methodologyContext;
    const system = buildHooksSystemPrompt(
      input.voiceDna,
      count,
      input.imf,
      input.userMethodology,
      ctx && ctx.house !== undefined && ctx.scripts !== undefined
        ? { house: ctx.house, scripts: ctx.scripts }
        : undefined,
      ctx?.operatorRules ?? [],
    );
    const user = JSON.stringify(
      {
        concept,
        ...(input.imf ? { imf: input.imf } : {}),
        count,
      },
      null,
      2,
    );

    const raw = await this.llm.complete({ system, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      log.error("LLM returned invalid JSON", { raw_preview: raw.slice(0, 400) });
      throw new Error(`HookGenerator: LLM did not return valid JSON (${(e as Error).message})`);
    }

    assertHookBatchShape(parsed, count);

    const violations: SlopViolation[] = [];
    for (const h of parsed.hooks) {
      const r = validateAntiSlop(h.text);
      if (!r.ok) violations.push(...r.violations);
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    return {
      hooks: parsed.hooks,
      suggested_index: parsed.suggested_index,
      meta: { generated_at: this.now().toISOString() },
    };
  }
}

function assertHookBatchShape(
  value: unknown,
  expected: number,
): asserts value is { hooks: GeneratedHook[]; suggested_index: number } {
  if (!value || typeof value !== "object") {
    throw new Error("HookGenerator: response is not an object");
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.hooks)) {
    throw new Error("HookGenerator: hooks must be an array");
  }
  if (v.hooks.length === 0) {
    throw new Error("HookGenerator: hooks array is empty");
  }
  // We accept any 4..8 count, not strictly the requested count, in case the
  // model trims one for quality. Reject only egregious deviations.
  if (v.hooks.length < expected - 2 || v.hooks.length > expected + 2) {
    throw new Error(
      `HookGenerator: expected ~${expected} hooks, got ${v.hooks.length}`,
    );
  }
  v.hooks.forEach((h, i) => {
    if (!h || typeof h !== "object") {
      throw new Error(`HookGenerator: hooks[${i}] is not an object`);
    }
    const hh = h as Record<string, unknown>;
    if (typeof hh.text !== "string" || hh.text.length === 0) {
      throw new Error(`HookGenerator: hooks[${i}].text missing or empty`);
    }
    if (typeof hh.type !== "string" || !VALID_TYPES.has(hh.type as HookType)) {
      throw new Error(
        `HookGenerator: hooks[${i}].type "${String(hh.type)}" is not valid`,
      );
    }
    if (!hh.score || typeof hh.score !== "object") {
      throw new Error(`HookGenerator: hooks[${i}].score missing`);
    }
    const score = hh.score as Record<string, unknown>;
    for (const k of SCORE_KEYS) {
      const n = score[k];
      if (typeof n !== "number" || n < 0 || n > 1 || Number.isNaN(n)) {
        throw new Error(
          `HookGenerator: hooks[${i}].score.${k} must be a 0..1 number, got ${String(n)}`,
        );
      }
    }
  });

  if (
    typeof v.suggested_index !== "number" ||
    v.suggested_index < 0 ||
    v.suggested_index >= v.hooks.length
  ) {
    throw new Error(
      `HookGenerator: suggested_index ${String(v.suggested_index)} out of range`,
    );
  }
}

/** Average of all five score signals. UI may use for sort or recommendation override. */
export function hookTotalScore(s: HookScore): number {
  return (
    (s.curiosity + s.specificity + s.voice_match + s.brevity + s.identity_alignment) / 5
  );
}
