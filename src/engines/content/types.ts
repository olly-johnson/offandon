/**
 * Content Engine. Public type surface.
 *
 * The Content Engine generates user-facing copy (scripts, hooks, captions).
 * It depends on the Voice Engine for VoiceDNA but is otherwise independent.
 */

import type { VoiceDNA } from "@/engines/voice/types";

/**
 * The angle a script takes. Used to diversify a batch so we don't end up
 * with seven "pain point" hooks in a row.
 */
export type ScriptAngle =
  | "pain_point"
  | "aspiration"
  | "contrarian"
  | "case_study"
  | "framework"
  | "story"
  | "myth_buster";

export interface GeneratedScript {
  /** Attention-grabbing opener. 1 to 2 sentences, ideally under 30 words. */
  hook: string;
  /** Full script body. Roughly 50 to 150 words, suitable for a short-form video. */
  body: string;
  /** Name of the content pillar this script ladders up to. Must match one of voiceDna.content_pillars[*].name. */
  pillar: string;
  /** Hook archetype. Helps the UI explain why the batch feels diverse. */
  angle: ScriptAngle;
}

export interface GeneratedBatch {
  scripts: GeneratedScript[];
  meta: {
    requested_count: number;
    actual_count: number;
    /** ISO-8601. Stamped at generator return time, not at LLM-response time. */
    generated_at: string;
  };
}

export interface GenerateScriptsInput {
  voiceDna: VoiceDNA;
  /** Number of scripts to ask for. Validated 1..30 in DB; sane MVP default is 7. */
  count: number;
  /** Optional per-user methodology overlay (BO-036). */
  userMethodology?: string | null;
  /**
   * Optional operator-curated reference material (BO-042). When present,
   * the system prompt embeds stories, viral references, templates, and
   * past scripts the creator has approved. Empty arrays / null skip the
   * block entirely so non-ingested users see no change.
   */
  clientAssets?: import("./client-assets-persistence").ScriptAssetsContext | null;
}

export interface IScriptGenerator {
  /**
   * Generate a batch of `count` scripts grounded in the supplied VoiceDNA.
   * Throws SlopError if any output string violates the Humanization Manifesto.
   * Throws on shape mismatch from the LLM.
   */
  generate(input: GenerateScriptsInput): Promise<GeneratedBatch>;
}

/**
 * IMF triple. Idea / Message / Feel — the three locked inputs the
 * methodology demands before a script can be written.
 *
 *   idea    one sentence: what is this video specifically about
 *   message what should the viewer walk away understanding
 *   feel    how should they feel about the creator after watching
 */
export interface IMF {
  idea: string;
  message: string;
  feel: string;
}

/**
 * Hook archetype the wizard surfaces. Drawn from the methodology's
 * SCCCC framework + the funnel-stage taxonomy in 03-scripts.md.
 */
export type HookType =
  | "STORYTELLING"
  | "CONFRONTATIONAL"
  | "VULNERABILITY"
  | "CURIOSITY"
  | "PROOF"
  | "EDUCATIONAL";

/**
 * Self-scored hook. The model rates its own hook against the
 * methodology's primary signals so the UI can sort and recommend.
 * All scores 0..1 inclusive.
 */
export interface HookScore {
  curiosity: number;
  specificity: number;
  voice_match: number;
  brevity: number;
  identity_alignment: number;
}

export interface GeneratedHook {
  text: string;
  type: HookType;
  score: HookScore;
}

export interface GeneratedHookBatch {
  hooks: GeneratedHook[];
  /** Index of the hook the engine recommends as the strongest. */
  suggested_index: number;
  meta: {
    generated_at: string;
  };
}

export interface GenerateHooksInput {
  voiceDna: VoiceDNA;
  /** Free-text concept the creator typed in step 1. */
  concept: string;
  /** Optional IMF triple from step 2. When present, weights heavier than concept alone. */
  imf?: IMF;
  /** How many hooks to generate. 4..8 supported; default 6. */
  count?: number;
  /** Optional per-user methodology overlay (BO-036). */
  userMethodology?: string | null;
}

export interface GeneratedSingleScript {
  hook: string;
  body: string;
  pillar: string;
  angle: ScriptAngle;
  word_count: number;
  meta: {
    generated_at: string;
  };
}

export interface GenerateSingleScriptInput {
  voiceDna: VoiceDNA;
  concept: string;
  imf?: IMF;
  /** Locked hook the creator picked in step 3. */
  hook: string;
  /** Optional refinement note from step 5; appended to the user payload. */
  refinement?: string;
  /** Optional per-user methodology overlay (BO-036). */
  userMethodology?: string | null;
}

export interface IIMFExtractor {
  /**
   * Distil a free-text concept into an IMF triple. Used by the wizard's
   * step 2 auto-extract.
   */
  extract(input: {
    voiceDna: VoiceDNA;
    concept: string;
    userMethodology?: string | null;
  }): Promise<IMF>;
}

export interface IHookGenerator {
  generateHooks(input: GenerateHooksInput): Promise<GeneratedHookBatch>;
}

export interface ISingleScriptGenerator {
  generateOne(input: GenerateSingleScriptInput): Promise<GeneratedSingleScript>;
}
