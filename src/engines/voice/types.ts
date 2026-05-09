/**
 * Voice Engine: public type surface.
 *
 * The Voice Engine is the only path that creates or refreshes a user's
 * `VoiceDNA`. Other engines (content, social) are consumers, not authors.
 */

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
  /** Free-form description of the audience they want to attract. */
  target_audience: string;
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
