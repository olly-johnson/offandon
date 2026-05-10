/**
 * Voice Engine: public type surface.
 *
 * The Voice Engine is the only path that creates or refreshes a user's
 * `VoiceDNA`. Other engines (content, social) are consumers, not authors.
 */

export type SwearingLevel = "none" | "light" | "strategic" | "frequent";
export type HumorStyle = "self_deprecating" | "dry" | "banter" | "none";
export type EnergySignal = "calm_authority" | "high_energy" | "reflective" | "intense";

/**
 * ICP profile expansion, derived from the creator-strategy template's
 * five-axis breakdown. Each axis powers a different downstream content
 * angle: pain_points feed Common Mistake / Myth Busting; thoughts_at_2am
 * feed Mirror Thinking lines; internal_battles feed Big Goal / About Me;
 * dreams feed BOF Selling pieces.
 */
export interface ICPProfile {
  /** Top stuck-points (ranked, ideally 3 to 6 entries). */
  pain_points: string[];
  /** What "winning" looks like for them (ranked). */
  desires: string[];
  /** What they think about lying in bed at 2am (ranked). */
  thoughts_at_2am: string[];
  /** The internal arguments they have with themselves (ranked). */
  internal_battles: string[];
  /** The big-picture life they want, beyond business (ranked). */
  dreams: string[];
}

/**
 * Positioning statement. Required because the SCCCC hook framework relies
 * on Contrast and Clarity, and both fail without a defined contrarian
 * stance.
 */
export interface PositioningStatement {
  /** The one belief that drives everything the creator does. One sentence. */
  core_philosophy: string;
  /** A widely-held belief in their industry that they think is wrong. */
  contrarian_belief: string;
  /** What separates them from every other person in their niche. */
  differentiator: string;
}

/**
 * Seed material for the story bank. Optional at onboarding because the
 * creator can grow it later in /settings/story-bank, but strongly
 * encouraged. Without seeds the Script Writer either fabricates (banned)
 * or stays generic (weak).
 */
export interface StoryBankSeed {
  /** A specific moment when things were as bad as they got. */
  rock_bottom?: string;
  /** The shift moment. What changed and why. */
  breakthrough?: string;
  /** What they are chasing or building right now that the audience can follow. */
  current_journey?: string;
}

/**
 * Voice dials the methodology actually pulls when shaping a hook's energy
 * or a script's register. Distinct from `tone_profile` (which is the LLM's
 * derived label). These are the creator's stated preferences.
 */
export interface VoiceSignals {
  /** Phrases the creator actually uses that should appear in their content. */
  signature_phrases?: string[];
  swearing_level: SwearingLevel;
  humor_style: HumorStyle;
  energy: EnergySignal;
}

export interface ExampleCreator {
  name: string;
  platform?: string;
  /** One line on why they admire / compete with this creator. */
  why?: string;
}

export interface OnboardingAnswers {
  /** ICP / niche the creator serves, e.g. "B2B SaaS founders". */
  niche: string;
  /** What the creator's business does, in their own words. */
  business_description: string;
  /** Concrete outcomes they want from Bot OS, ranked. */
  goals: string[];
  /** Verbatim samples of past content the creator considers "on voice". */
  voice_samples: string[];
  /** Posts / formats / hooks the creator says are working for them. */
  what_works: string;
  /** Where the creator says they are stuck or unsure. */
  where_stuck: string;
  /**
   * Structured audience profile. Required because every downstream content
   * angle pulls from one of its axes.
   */
  icp: ICPProfile;
  /**
   * Required positioning statement. The Script Writer's hooks fail without
   * a defined contrarian stance.
   */
  positioning: PositioningStatement;
  /** Optional story bank seed. Three short prompts the creator can fill later. */
  story_bank?: StoryBankSeed;
  /** Optional voice dials beyond the LLM-derived tone_profile. */
  voice_signals?: VoiceSignals;
  /** Optional creators they admire / compete with. Feeds the future analyst. */
  example_creators?: ExampleCreator[];
  /** Topics or angles the creator wants to own. */
  preferred_topics?: string[];
  /** Phrases / tropes the creator personally bans (in addition to manifesto). */
  user_prohibited_phrases?: string[];
}

export type Energy = "low" | "medium" | "high";
export type Formality = "casual" | "conversational" | "formal";

export interface ToneProfile {
  /** Single short label, e.g. "professional-direct", "warm-mentor". */
  primary: string;
  energy: Energy;
  formality: Formality;
  /** Adjectives that describe the voice, e.g. ["candid", "strategic"]. */
  descriptors: string[];
}

export interface ContentPillar {
  name: string;
  description: string;
  example_topics: string[];
}

export interface AudiencePersona {
  description: string;
  pain_points: string[];
  aspirations: string[];
  /** Plain-language register hint, e.g. "operator-to-operator, no jargon". */
  language_register: string;
}

export interface VoiceDNA {
  tone_profile: ToneProfile;
  content_pillars: ContentPillar[];
  /**
   * Union of the user's personal bans and the global Humanization Manifesto.
   * The Voice Engine is responsible for merging both lists.
   */
  prohibited_phrases: string[];
  audience_persona: AudiencePersona;
  /** ISO-8601 generation timestamp. */
  generated_at: string;
  /** SHA-256 hex of the source questionnaire JSON. Reproducibility hook. */
  source_questionnaire_hash: string;
}

export interface IVoiceEngine {
  /**
   * Convert raw onboarding answers into a persistent Voice DNA profile.
   * Throws `SlopError` if the LLM output violates the Humanization Manifesto.
   */
  generateDNA(answers: OnboardingAnswers): Promise<VoiceDNA>;
}
