import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

/**
 * Per BO-042: operator-driven ingestion populates `voice_dna` (and
 * `profiles`) before the user signs in. The wizard at /onboarding then
 * has nothing useful to do for those users and must be skipped.
 *
 * `hasVoiceDna` is the cheap-and-stable signal: the wizard's exit
 * condition has always been "save a Voice DNA row", so a row's presence
 * means onboarding is complete regardless of which surface ran it.
 *
 * The check intentionally uses the active-row filter rather than counting
 * — old (superseded) rows from a re-ingest also count as "already
 * onboarded" if no current row exists, but we want the active-row case
 * for the prompt-builder path anyway.
 */
export async function hasVoiceDna(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("voice_dna")
    .select("id")
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) {
    // Fail open to the wizard rather than silently sending an ingested
    // user back through onboarding. Caller logs the error.
    throw new Error(`hasVoiceDna: ${error.message}`);
  }
  return !!data;
}
