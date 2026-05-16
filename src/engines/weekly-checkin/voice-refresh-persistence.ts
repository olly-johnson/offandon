/**
 * Service-role voice_dna swap (BO-060).
 *
 * The Voice Engine's normal save path goes through `replace_voice_dna`,
 * a SECURITY INVOKER RPC that authenticates against auth.uid(). The
 * Inngest worker has no end-user JWT, so the RPC can't be used here.
 * Instead we replicate the same atomicity guarantee (one active row per
 * user) with two service-role writes inside a single function.
 *
 * The partial unique index voice_dna_one_active_per_user is what
 * actually enforces uniqueness; this function just orders the writes
 * correctly so the live row is never visible-and-superseded
 * simultaneously.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OnboardingAnswers, VoiceDNA } from "@/engines/voice/types";
import type { Database, Json } from "@/lib/shared/supabase";

export type ServiceVoiceSupabase = SupabaseClient<Database>;

export async function adminReplaceVoiceDNA(
  supabase: ServiceVoiceSupabase,
  userId: string,
  dna: VoiceDNA,
  answers: OnboardingAnswers,
): Promise<void> {
  const supersedeRes = await supabase
    .from("voice_dna")
    .update({ superseded_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("superseded_at", null);
  if (supersedeRes.error) {
    throw new Error(`adminReplaceVoiceDNA.supersede: ${supersedeRes.error.message}`);
  }

  const insertRes = await supabase.from("voice_dna").insert({
    user_id: userId,
    dna: dna as unknown as Json,
    source_answers: answers as unknown as Json,
    source_questionnaire_hash: dna.source_questionnaire_hash,
  });
  if (insertRes.error) {
    throw new Error(`adminReplaceVoiceDNA.insert: ${insertRes.error.message}`);
  }
}

export async function getActiveVoiceDNAForUser(
  supabase: ServiceVoiceSupabase,
  userId: string,
): Promise<{ dna: VoiceDNA; source_answers: OnboardingAnswers } | null> {
  const { data, error } = await supabase
    .from("voice_dna")
    .select("dna, source_answers")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`getActiveVoiceDNAForUser: ${error.message}`);
  }
  if (!data) return null;
  return {
    dna: data.dna as unknown as VoiceDNA,
    source_answers: data.source_answers as unknown as OnboardingAnswers,
  };
}
