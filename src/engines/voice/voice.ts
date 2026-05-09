import { createHash } from "node:crypto";

import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";

import { buildVoiceDNASystemPrompt } from "./system-prompt";
import type { IVoiceEngine, OnboardingAnswers, VoiceDNA } from "./types";

/**
 * Minimal LLM client surface the Voice Engine depends on. Production binds
 * this to the Anthropic SDK; tests bind it to a deterministic stub.
 */
export interface ILLMClient {
  complete(args: { system: string; user: string }): Promise<string>;
}

export interface VoiceEngineOptions {
  llm: ILLMClient;
  /** Override the wall clock — useful for deterministic tests. */
  now?: () => Date;
}

export class VoiceEngine implements IVoiceEngine {
  private readonly llm: ILLMClient;
  private readonly now: () => Date;

  constructor(opts: VoiceEngineOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async generateDNA(answers: OnboardingAnswers): Promise<VoiceDNA> {
    const system = buildVoiceDNASystemPrompt();
    const user = JSON.stringify(answers, null, 2);

    const raw = await this.llm.complete({ system, user });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`VoiceEngine: LLM did not return valid JSON (${(e as Error).message})`);
    }

    assertVoiceDNAShape(parsed);

    // Collect every violation across every user-facing string before throwing.
    // Surfacing only the first hit makes LLM debugging painfully iterative.
    const violations: SlopViolation[] = [];
    for (const field of collectUserFacingStrings(parsed)) {
      const result = validateAntiSlop(field);
      if (!result.ok) violations.push(...result.violations);
    }
    if (violations.length > 0) {
      throw new SlopError(violations);
    }

    parsed.generated_at = this.now().toISOString();
    parsed.source_questionnaire_hash = sha256(JSON.stringify(answers));

    return parsed;
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function assertVoiceDNAShape(value: unknown): asserts value is VoiceDNA {
  if (!value || typeof value !== "object") {
    throw new Error("VoiceDNA: response is not an object");
  }
  const v = value as Record<string, unknown>;
  const tone = v.tone_profile as Record<string, unknown> | undefined;
  if (!tone || typeof tone.primary !== "string") {
    throw new Error("VoiceDNA: tone_profile.primary missing or not a string");
  }
  if (!Array.isArray(v.content_pillars)) {
    throw new Error("VoiceDNA: content_pillars must be an array");
  }
  if (!Array.isArray(v.prohibited_phrases)) {
    throw new Error("VoiceDNA: prohibited_phrases must be an array");
  }
  const persona = v.audience_persona as Record<string, unknown> | undefined;
  if (!persona || typeof persona.description !== "string") {
    throw new Error("VoiceDNA: audience_persona.description missing");
  }
}

/**
 * Collect every string the engine considers "user-facing" — anything that
 * could reach a Bot OS surface (chat, scripts, dashboard). Deliberately
 * skips `prohibited_phrases`, which is metadata: it is allowed to name
 * banned words by definition.
 */
function collectUserFacingStrings(dna: VoiceDNA): string[] {
  const out: string[] = [];
  const tp = dna.tone_profile;
  out.push(tp.primary);
  if (tp.descriptors) out.push(...tp.descriptors);

  for (const pillar of dna.content_pillars ?? []) {
    out.push(pillar.name, pillar.description);
    if (pillar.example_topics) out.push(...pillar.example_topics);
  }

  const ap = dna.audience_persona;
  if (ap) {
    out.push(ap.description, ap.language_register);
    if (ap.pain_points) out.push(...ap.pain_points);
    if (ap.aspirations) out.push(...ap.aspirations);
  }
  return out;
}
