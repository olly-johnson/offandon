import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";

import type { ILLMClient } from "@/engines/voice/voice";

import { buildScriptsSystemPrompt } from "./system-prompt";
import type {
  GeneratedBatch,
  GeneratedScript,
  GenerateScriptsInput,
  IScriptGenerator,
  ScriptAngle,
} from "./types";

const log = createLogger("content.script-generator");

export interface ScriptGeneratorOptions {
  llm: ILLMClient;
  /** Override the wall clock; useful for deterministic tests. */
  now?: () => Date;
}

const VALID_ANGLES: ReadonlySet<ScriptAngle> = new Set([
  "pain_point",
  "aspiration",
  "contrarian",
  "case_study",
  "framework",
  "story",
  "myth_buster",
]);

export class ScriptGenerator implements IScriptGenerator {
  private readonly llm: ILLMClient;
  private readonly now: () => Date;

  constructor(opts: ScriptGeneratorOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async generate(input: GenerateScriptsInput): Promise<GeneratedBatch> {
    if (input.count < 1 || input.count > 30) {
      throw new Error(`ScriptGenerator: count must be between 1 and 30, got ${input.count}`);
    }
    if (!input.voiceDna.content_pillars || input.voiceDna.content_pillars.length === 0) {
      throw new Error("ScriptGenerator: VoiceDNA has no content_pillars");
    }

    const system = buildScriptsSystemPrompt(input.voiceDna, input.userMethodology);
    const user = JSON.stringify({ count: input.count }, null, 2);

    const raw = await this.llm.complete({ system, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      log.error("LLM returned invalid JSON", { raw_preview: raw.slice(0, 400) });
      throw new Error(`ScriptGenerator: LLM did not return valid JSON (${(e as Error).message})`);
    }

    log.debug("parsed batch shape", {
      top_level_keys:
        parsed && typeof parsed === "object" ? Object.keys(parsed as object) : typeof parsed,
      script_count: (parsed as { scripts?: unknown[] })?.scripts?.length,
    });

    const validPillars = new Set(input.voiceDna.content_pillars.map((p) => p.name));
    assertBatchShape(parsed, validPillars);

    // Collect every anti-slop violation across every user-facing string before
    // throwing, so debugging an LLM regression is one-shot. Pillar names ARE
    // user-visible (rendered on the dashboard) so they get checked too.
    const violations: SlopViolation[] = [];
    for (const script of parsed.scripts) {
      for (const text of [script.hook, script.body, script.pillar]) {
        const r = validateAntiSlop(text);
        if (!r.ok) violations.push(...r.violations);
      }
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    return {
      scripts: parsed.scripts,
      meta: {
        requested_count: input.count,
        actual_count: parsed.scripts.length,
        generated_at: this.now().toISOString(),
      },
    };
  }
}

function assertBatchShape(
  value: unknown,
  validPillars: ReadonlySet<string>,
): asserts value is { scripts: GeneratedScript[] } {
  if (!value || typeof value !== "object") {
    throw new Error("ScriptGenerator: response is not an object");
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.scripts)) {
    throw new Error("ScriptGenerator: scripts must be an array");
  }
  if (v.scripts.length === 0) {
    throw new Error("ScriptGenerator: scripts array is empty");
  }
  v.scripts.forEach((script, i) => {
    if (!script || typeof script !== "object") {
      throw new Error(`ScriptGenerator: scripts[${i}] is not an object`);
    }
    const s = script as Record<string, unknown>;
    if (typeof s.hook !== "string" || s.hook.length === 0) {
      throw new Error(`ScriptGenerator: scripts[${i}].hook missing or empty`);
    }
    if (typeof s.body !== "string" || s.body.length === 0) {
      throw new Error(`ScriptGenerator: scripts[${i}].body missing or empty`);
    }
    if (typeof s.pillar !== "string" || !validPillars.has(s.pillar)) {
      throw new Error(
        `ScriptGenerator: scripts[${i}].pillar "${String(s.pillar)}" is not in the creator's content_pillars`,
      );
    }
    if (typeof s.angle !== "string" || !VALID_ANGLES.has(s.angle as ScriptAngle)) {
      throw new Error(
        `ScriptGenerator: scripts[${i}].angle "${String(s.angle)}" is not a valid angle`,
      );
    }
  });
}
