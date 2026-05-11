import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";

import { buildSingleScriptSystemPrompt } from "./single-script-system-prompt";
import type {
  GeneratedSingleScript,
  GenerateSingleScriptInput,
  ISingleScriptGenerator,
  ScriptAngle,
} from "./types";

const log = createLogger("content.single-script-generator");

const VALID_ANGLES: ReadonlySet<ScriptAngle> = new Set([
  "pain_point",
  "aspiration",
  "contrarian",
  "case_study",
  "framework",
  "story",
  "myth_buster",
]);

export interface SingleScriptGeneratorOptions {
  llm: ILLMClient;
  now?: () => Date;
}

export class SingleScriptGenerator implements ISingleScriptGenerator {
  private readonly llm: ILLMClient;
  private readonly now: () => Date;

  constructor(opts: SingleScriptGeneratorOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async generateOne(input: GenerateSingleScriptInput): Promise<GeneratedSingleScript> {
    const concept = input.concept.trim();
    if (concept.length < 8) {
      throw new Error("SingleScriptGenerator: concept too short");
    }
    if (!input.hook || input.hook.trim().length === 0) {
      throw new Error("SingleScriptGenerator: locked hook is required");
    }
    if (!input.voiceDna.content_pillars || input.voiceDna.content_pillars.length === 0) {
      throw new Error("SingleScriptGenerator: VoiceDNA has no content_pillars");
    }

    const system = buildSingleScriptSystemPrompt(
      input.voiceDna,
      input.hook,
      input.imf,
      input.userMethodology,
    );
    const user = JSON.stringify(
      {
        concept,
        ...(input.imf ? { imf: input.imf } : {}),
        hook: input.hook,
        ...(input.refinement ? { refinement: input.refinement } : {}),
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
      throw new Error(
        `SingleScriptGenerator: LLM did not return valid JSON (${(e as Error).message})`,
      );
    }

    const validPillars = new Set(input.voiceDna.content_pillars.map((p) => p.name));
    assertSingleScriptShape(parsed, validPillars);

    const violations: SlopViolation[] = [];
    for (const text of [parsed.hook, parsed.body, parsed.pillar]) {
      const r = validateAntiSlop(text);
      if (!r.ok) violations.push(...r.violations);
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    return {
      hook: parsed.hook,
      body: parsed.body,
      pillar: parsed.pillar,
      angle: parsed.angle,
      word_count: parsed.word_count,
      meta: { generated_at: this.now().toISOString() },
    };
  }
}

function assertSingleScriptShape(
  value: unknown,
  validPillars: ReadonlySet<string>,
): asserts value is {
  hook: string;
  body: string;
  pillar: string;
  angle: ScriptAngle;
  word_count: number;
} {
  if (!value || typeof value !== "object") {
    throw new Error("SingleScriptGenerator: response is not an object");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.hook !== "string" || v.hook.length === 0) {
    throw new Error("SingleScriptGenerator: hook missing or empty");
  }
  if (typeof v.body !== "string" || v.body.length === 0) {
    throw new Error("SingleScriptGenerator: body missing or empty");
  }
  if (typeof v.pillar !== "string" || !validPillars.has(v.pillar)) {
    throw new Error(
      `SingleScriptGenerator: pillar "${String(v.pillar)}" not in creator's content_pillars`,
    );
  }
  if (typeof v.angle !== "string" || !VALID_ANGLES.has(v.angle as ScriptAngle)) {
    throw new Error(`SingleScriptGenerator: angle "${String(v.angle)}" not valid`);
  }
  if (typeof v.word_count !== "number" || v.word_count <= 0) {
    throw new Error(
      `SingleScriptGenerator: word_count must be a positive number, got ${String(v.word_count)}`,
    );
  }
}
