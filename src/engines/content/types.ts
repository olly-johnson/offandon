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
}

export interface IScriptGenerator {
  /**
   * Generate a batch of `count` scripts grounded in the supplied VoiceDNA.
   * Throws SlopError if any output string violates the Humanization Manifesto.
   * Throws on shape mismatch from the LLM.
   */
  generate(input: GenerateScriptsInput): Promise<GeneratedBatch>;
}
