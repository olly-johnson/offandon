import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/shared/supabase";

import type { OnboardingAnswers, VoiceDNA } from "./types";

/**
 * Convenience alias for downstream callers. They should not need to know
 * which Database schema this engine is bound to.
 */
export type VoiceSupabaseClient = SupabaseClient<Database>;

/**
 * Persist a freshly-generated Voice DNA for the authenticated caller.
 *
 * Routed through the `replace_voice_dna` RPC so the supersede + insert
 * happens in a single transaction; the partial unique index on
 * `(user_id) WHERE superseded_at IS NULL` makes any non-atomic two-step
 * implementation race-prone.
 *
 * The caller's identity is taken from the Supabase JWT inside the function.
 * The userId you might be holding in the application layer is intentionally
 * NOT a parameter; passing it would be a footgun if it ever drifted from
 * the JWT.
 */
export async function saveVoiceDNA(
  supabase: VoiceSupabaseClient,
  dna: VoiceDNA,
  answers: OnboardingAnswers,
): Promise<void> {
  const { error } = await supabase.rpc("replace_voice_dna", {
    p_dna: dna as unknown as Json,
    p_source_answers: answers as unknown as Json,
    p_source_questionnaire_hash: dna.source_questionnaire_hash,
  });
  if (error) {
    throw new Error(`saveVoiceDNA: ${error.message}`);
  }
}

/**
 * Fetch the active Voice DNA for a given user, or null if none has been
 * generated yet. Returns null on the first onboarding before
 * `saveVoiceDNA` has run.
 */
export async function getCurrentVoiceDNA(
  supabase: VoiceSupabaseClient,
  userId: string,
): Promise<VoiceDNA | null> {
  const { data, error } = await supabase
    .from("voice_dna")
    .select("dna")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getCurrentVoiceDNA: ${error.message}`);
  }
  if (!data) return null;

  return data.dna as unknown as VoiceDNA;
}

/**
 * Fetch the raw OnboardingAnswers used to generate the active Voice DNA,
 * or null if none. The distilled VoiceDNA only carries tone / pillars /
 * audience_persona / prohibited_phrases; downstream prompts that want the
 * richer ICP axes (thoughts_at_2am, internal_battles, dreams), positioning
 * (core_philosophy, contrarian_belief, differentiator), story-bank seeds,
 * or signature phrases need this loader instead.
 */
export async function getCurrentOnboardingAnswers(
  supabase: VoiceSupabaseClient,
  userId: string,
): Promise<import("./types").OnboardingAnswers | null> {
  const { data, error } = await supabase
    .from("voice_dna")
    .select("source_answers")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`getCurrentOnboardingAnswers: ${error.message}`);
  }
  if (!data) return null;

  return data.source_answers as unknown as import("./types").OnboardingAnswers;
}
