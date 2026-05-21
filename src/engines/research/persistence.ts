import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { MediaAnalysis } from "./types";

const log = createLogger("research.persistence");

export type ResearchSupabaseClient = SupabaseClient<Database>;

export interface SaveAnalysisArgs {
  mediaId: string;
  userId: string;
  analysis: MediaAnalysis;
  llmModel: string;
  transcriptModel: string;
}

/**
 * Upsert one analysis row keyed on media_id. Re-analysis overwrites
 * the prior row; we don't keep history because the analysis is a
 * function of (transcript, prompt, model) which all evolve together.
 *
 * Also writes a research_analysis_runs row for the rate limiter. The
 * limiter row is best-effort: if the audit insert fails after the
 * analysis upsert succeeded, we log + swallow rather than letting the
 * limiter failure shadow a successful analysis.
 */
export async function saveAnalysis(
  supabase: ResearchSupabaseClient,
  args: SaveAnalysisArgs,
): Promise<void> {
  const { error } = await supabase
    .from("instagram_media_analysis")
    .upsert({
      media_id: args.mediaId,
      user_id: args.userId,
      transcript: args.analysis.transcript,
      hook: args.analysis.hook,
      structure: args.analysis.structure,
      pillar_match: args.analysis.pillar_match,
      performance_score: args.analysis.performance_score,
      what_worked: args.analysis.what_worked,
      what_to_repeat: args.analysis.what_to_repeat,
      llm_model: args.llmModel,
      transcript_model: args.transcriptModel,
      analyzed_at: new Date().toISOString(),
    });
  if (error) {
    throw new Error(`saveAnalysis: ${error.message}`);
  }

  const auditWrite = await supabase
    .from("research_analysis_runs")
    .insert({ user_id: args.userId, media_id: args.mediaId });
  if (auditWrite.error) {
    log.warn("research_analysis_runs insert failed (rate limiter under-counts)", {
      user_id: args.userId,
      media_id: args.mediaId,
      message: auditWrite.error.message,
    });
  }
}

export async function getAnalysisForMedia(
  supabase: ResearchSupabaseClient,
  mediaId: string,
): Promise<MediaAnalysis | null> {
  const { data, error } = await supabase
    .from("instagram_media_analysis")
    .select(
      "transcript, hook, structure, pillar_match, performance_score, what_worked, what_to_repeat",
    )
    .eq("media_id", mediaId)
    .maybeSingle();
  if (error) throw new Error(`getAnalysisForMedia: ${error.message}`);
  if (!data) return null;
  return data as MediaAnalysis;
}

/**
 * Bulk fetch by media ids. Used by the /library page to render
 * analysis state next to each video tile.
 */
export async function getAnalysesForMediaIds(
  supabase: ResearchSupabaseClient,
  mediaIds: string[],
): Promise<Map<string, MediaAnalysis>> {
  if (mediaIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("instagram_media_analysis")
    .select(
      "media_id, transcript, hook, structure, pillar_match, performance_score, what_worked, what_to_repeat",
    )
    .in("media_id", mediaIds);
  if (error) throw new Error(`getAnalysesForMediaIds: ${error.message}`);
  const out = new Map<string, MediaAnalysis>();
  for (const row of data ?? []) {
    const { media_id, ...rest } = row as { media_id: string } & MediaAnalysis;
    out.set(media_id, rest as MediaAnalysis);
  }
  return out;
}
