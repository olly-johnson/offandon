import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";

import { buildOutlierIdeaSystemPrompt } from "./outlier-idea-system-prompt";
import type {
  GeneratedIdea,
  GeneratedIdeaSet,
  GenerateOutlierIdeasInput,
  IOutlierIdeaGenerator,
  ScriptAngle,
} from "./types";

const log = createLogger("content.outlier-idea-generator");

const VALID_ANGLES: ReadonlySet<ScriptAngle> = new Set([
  "pain_point",
  "aspiration",
  "contrarian",
  "case_study",
  "framework",
  "story",
  "myth_buster",
]);

const MIN_IDEAS = 1;
const MAX_IDEAS = 5;
const DEFAULT_IDEAS = 3;

/** Keep a long transcript from blowing the prompt budget; it's only a pattern reference. */
const TRANSCRIPT_RENDER_CAP = 1500;

export interface OutlierIdeaGeneratorOptions {
  llm: ILLMClient;
  now?: () => Date;
}

export class OutlierIdeaGenerator implements IOutlierIdeaGenerator {
  private readonly llm: ILLMClient;
  private readonly now: () => Date;

  constructor(opts: OutlierIdeaGeneratorOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async generate(input: GenerateOutlierIdeasInput): Promise<GeneratedIdeaSet> {
    const pillars = input.voiceDna.content_pillars;
    if (!pillars || pillars.length === 0) {
      throw new Error("OutlierIdeaGenerator: VoiceDNA has no content_pillars");
    }

    const count = clampCount(input.count ?? DEFAULT_IDEAS);

    const ctx = input.methodologyContext;
    const system = buildOutlierIdeaSystemPrompt(
      input.voiceDna,
      input.userMethodology,
      ctx && ctx.house !== undefined && ctx.scripts !== undefined
        ? { house: ctx.house, scripts: ctx.scripts }
        : undefined,
      ctx?.operatorRules ?? [],
    );

    const o = input.outlier;
    const user = JSON.stringify(
      {
        count,
        outlier: {
          source_username: o.source_username,
          hook: o.hook,
          structure: o.structure,
          caption: o.caption,
          transcript: o.transcript ? truncate(o.transcript) : null,
          pillar_match: o.pillar_match ?? null,
        },
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
        `OutlierIdeaGenerator: LLM did not return valid JSON (${(e as Error).message})`,
      );
    }

    const validPillars = new Set(pillars.map((p) => p.name));
    const ideas = parseIdeas(parsed, validPillars).slice(0, count);
    if (ideas.length < MIN_IDEAS) {
      throw new Error("OutlierIdeaGenerator: response contained no ideas");
    }

    const violations: SlopViolation[] = [];
    for (const idea of ideas) {
      const r = validateAntiSlop(idea.content);
      if (!r.ok) violations.push(...r.violations);
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    return {
      ideas,
      meta: {
        requested_count: count,
        actual_count: ideas.length,
        generated_at: this.now().toISOString(),
      },
    };
  }
}

function clampCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IDEAS;
  return Math.min(MAX_IDEAS, Math.max(MIN_IDEAS, Math.trunc(n)));
}

function truncate(s: string): string {
  if (s.length <= TRANSCRIPT_RENDER_CAP) return s;
  return `${s.slice(0, TRANSCRIPT_RENDER_CAP).trimEnd()}...`;
}

function parseIdeas(
  value: unknown,
  validPillars: ReadonlySet<string>,
): GeneratedIdea[] {
  if (!value || typeof value !== "object") {
    throw new Error("OutlierIdeaGenerator: response is not an object");
  }
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.ideas)) {
    throw new Error("OutlierIdeaGenerator: response.ideas is not an array");
  }
  return v.ideas.map((item, i) => {
    if (!item || typeof item !== "object") {
      throw new Error(`OutlierIdeaGenerator: idea ${i} is not an object`);
    }
    const it = item as Record<string, unknown>;
    if (typeof it.content !== "string" || it.content.trim().length === 0) {
      throw new Error(`OutlierIdeaGenerator: idea ${i} content missing or empty`);
    }
    if (typeof it.pillar !== "string" || !validPillars.has(it.pillar)) {
      throw new Error(
        `OutlierIdeaGenerator: idea ${i} pillar "${String(it.pillar)}" not in creator's content_pillars`,
      );
    }
    if (typeof it.angle !== "string" || !VALID_ANGLES.has(it.angle as ScriptAngle)) {
      throw new Error(
        `OutlierIdeaGenerator: idea ${i} angle "${String(it.angle)}" not valid`,
      );
    }
    return {
      content: it.content.trim(),
      pillar: it.pillar,
      angle: it.angle as ScriptAngle,
    };
  });
}
