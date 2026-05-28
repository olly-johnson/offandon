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

/**
 * Methodology / operator-rules context, threaded into every content
 * engine generator (BO-048). The caller fetches once from the DB-or-file
 * loader and passes through. When omitted the engine falls back to the
 * file defaults at module-load time.
 */
export interface ContentMethodologyContext {
  house?: string;
  scripts?: string;
  operatorRules?: string[];
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
  /**
   * Optional top-k corpus retrieval (BO-051). When present, the system
   * prompt embeds long-form chunks (Fathom transcripts, questionnaire
   * responses, notes) the creator has accumulated since onboarding so
   * the batch is grounded in their recent material, not just the
   * operator-curated client_assets snapshot. Empty hits skip the block
   * so non-ingested users see no change.
   */
  corpusContext?: import("./corpus-context").ScriptsCorpusContext | null;
  /** House methodology overrides (BO-048). */
  methodologyContext?: ContentMethodologyContext;
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
  /** House methodology overrides (BO-048). */
  methodologyContext?: ContentMethodologyContext;
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
  /** House methodology overrides (BO-048). */
  methodologyContext?: ContentMethodologyContext;
}

/**
 * A high-performing competitor reel distilled to the pattern we want to
 * learn from. Fed to the OutlierIdeaGenerator, which mirrors the
 * *pattern* (hook style, topic angle, structural arc) but never the
 * competitor's specific content.
 */
export interface OutlierPattern {
  hook: string | null;
  structure: string | null;
  /** What the reel was about (its caption). */
  caption: string | null;
  /** Verbatim transcript. The generator truncates before sending. */
  transcript: string | null;
  /** Pillar the analyzer matched, if any. Advisory only. */
  pillar_match?: string | null;
  /** Source creator handle, used only to frame the "do not retell their story" rule. */
  source_username: string;
}

/**
 * One generated idea destined for the Ideas Bank. `content` is a short
 * concept (1-3 sentences) the creator could film in their own voice
 * about their own material; pillar/angle mirror the scripts taxonomy so
 * the idea slots cleanly into the Script Wizard downstream.
 */
export interface GeneratedIdea {
  content: string;
  /** Must match one of voiceDna.content_pillars[*].name. */
  pillar: string;
  angle: ScriptAngle;
}

export interface GeneratedIdeaSet {
  ideas: GeneratedIdea[];
  meta: {
    requested_count: number;
    actual_count: number;
    /** ISO-8601, stamped at generator return time. */
    generated_at: string;
  };
}

/**
 * Curated subset of OnboardingAnswers the outlier-idea prompt renders.
 * The active VoiceDNA only carries tone / pillars / audience_persona /
 * prohibited_phrases; this exposes the deeper content-strategy fields
 * (ICP axes beyond pain/aspiration, the contrarian belief, the story
 * bank seeds, the creator's signature phrases) so generated ideas can
 * ladder up to the creator's actual stories and worldview, not just
 * their tone.
 */
export interface OnboardingExtras {
  icp?: {
    thoughts_at_2am?: string[];
    internal_battles?: string[];
    dreams?: string[];
    desires?: string[];
  };
  positioning?: {
    core_philosophy?: string;
    contrarian_belief?: string;
    differentiator?: string;
  };
  story_bank?: {
    rock_bottom?: string;
    breakthrough?: string;
    current_journey?: string;
  };
  voice_signals?: {
    signature_phrases?: string[];
    humor_style?: string;
  };
}

export interface GenerateOutlierIdeasInput {
  voiceDna: VoiceDNA;
  /** The outlier reel pattern to learn from. */
  outlier: OutlierPattern;
  /** How many ideas to ask for. 1..5 supported; default 3. */
  count?: number;
  /** Optional per-user methodology overlay (BO-036). */
  userMethodology?: string | null;
  /** House methodology overrides (BO-048). */
  methodologyContext?: ContentMethodologyContext;
  /**
   * Optional operator-curated reference material (BO-042): the creator's
   * stories, viral references, templates, past scripts. Saved competitor
   * outliers are excluded by the loader (they're inspiration, not voice).
   */
  clientAssets?: import("./client-assets-persistence").ScriptAssetsContext | null;
  /**
   * Optional top-k corpus retrieval (BO-051): recent Fathom transcripts,
   * weekly check-ins, long-form notes. Skipped when VOYAGE_API_KEY is
   * unset; the generator works fine without it.
   */
  corpusContext?: import("./corpus-context").ScriptsCorpusContext | null;
  /**
   * Optional richer onboarding fields not exposed on VoiceDNA: ICP
   * extras, contrarian belief, story-bank seeds, signature phrases.
   * Drawn from `voice_dna.source_answers`.
   */
  onboardingExtras?: OnboardingExtras | null;
}

export interface IOutlierIdeaGenerator {
  /**
   * Turn one outlier reel into `count` original ideas in the creator's
   * voice about the creator's own stories, mirroring the outlier's
   * hook/topic/structure pattern. Throws on shape mismatch or SlopError.
   */
  generate(input: GenerateOutlierIdeasInput): Promise<GeneratedIdeaSet>;
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
    methodologyContext?: ContentMethodologyContext;
  }): Promise<IMF>;
}

export interface IHookGenerator {
  generateHooks(input: GenerateHooksInput): Promise<GeneratedHookBatch>;
}

export interface ISingleScriptGenerator {
  generateOne(input: GenerateSingleScriptInput): Promise<GeneratedSingleScript>;
}
