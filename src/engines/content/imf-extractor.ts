import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";

import { buildIMFSystemPrompt } from "./imf-system-prompt";
import type { IIMFExtractor, IMF } from "./types";
import type { VoiceDNA } from "@/engines/voice/types";

const log = createLogger("content.imf-extractor");

export interface IMFExtractorOptions {
  llm: ILLMClient;
}

export class IMFExtractor implements IIMFExtractor {
  private readonly llm: ILLMClient;

  constructor(opts: IMFExtractorOptions) {
    this.llm = opts.llm;
  }

  async extract(input: {
    voiceDna: VoiceDNA;
    concept: string;
    userMethodology?: string | null;
    methodologyContext?: import("./types").ContentMethodologyContext;
  }): Promise<IMF> {
    const concept = input.concept.trim();
    if (concept.length < 8) {
      throw new Error("IMFExtractor: concept too short to extract from (need at least 8 chars)");
    }

    const ctx = input.methodologyContext;
    const system = buildIMFSystemPrompt(
      input.voiceDna,
      input.userMethodology,
      ctx?.house !== undefined ? { house: ctx.house } : undefined,
      ctx?.operatorRules ?? [],
    );
    const user = JSON.stringify({ concept }, null, 2);

    const raw = await this.llm.complete({ system, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      log.error("LLM returned invalid JSON", { raw_preview: raw.slice(0, 400) });
      throw new Error(`IMFExtractor: LLM did not return valid JSON (${(e as Error).message})`);
    }

    assertIMFShape(parsed);

    const violations: SlopViolation[] = [];
    for (const text of [parsed.idea, parsed.message, parsed.feel]) {
      const r = validateAntiSlop(text);
      if (!r.ok) violations.push(...r.violations);
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    return parsed;
  }
}

function assertIMFShape(value: unknown): asserts value is IMF {
  if (!value || typeof value !== "object") {
    throw new Error("IMFExtractor: response is not an object");
  }
  const v = value as Record<string, unknown>;
  for (const field of ["idea", "message", "feel"] as const) {
    if (typeof v[field] !== "string" || (v[field] as string).trim().length === 0) {
      throw new Error(`IMFExtractor: ${field} missing or not a non-empty string`);
    }
  }
}
