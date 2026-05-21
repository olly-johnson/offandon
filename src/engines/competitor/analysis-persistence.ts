import { createLogger } from "@/lib/shared/logger";
import type { MediaAnalysis } from "@/engines/research";

import type { CompetitorSupabaseClient } from "./persistence";

const log = createLogger("competitor.analysis-persistence");

export type CompetitorAnalysisSupabaseClient = CompetitorSupabaseClient;

export interface SaveCompetitorAnalysisArgs {
  mediaId: string;
  competitorId: string;
  userId: string;
  analysis: MediaAnalysis;
  llmModel: string;
  transcriptModel: string;
}

/**
 * Upsert one analysis row keyed on media_id, then write the shared
 * research_analysis_runs audit row for the rolling-30d rate limiter.
 * The limiter is per-user (counts ANY analysis run), so competitor
 * analyses share the same quota as the user's own /library analyses
 * — operationally that's the right behaviour because Deepgram +
 * Anthropic spend is what we're really capping.
 */
export async function saveCompetitorAnalysis(
  supabase: CompetitorAnalysisSupabaseClient,
  args: SaveCompetitorAnalysisArgs,
): Promise<void> {
  const { error } = await supabase
    .from("competitor_media_analysis")
    .upsert({
      media_id: args.mediaId,
      competitor_id: args.competitorId,
      user_id: args.userId,
      transcript: args.analysis.transcript,
      hook: args.analysis.hook,
      structure: args.analysis.structure,
      pillar_match: args.analysis.pillar_match,
      performance_label: args.analysis.performance_label,
      what_worked: args.analysis.what_worked,
      what_to_repeat: args.analysis.what_to_repeat,
      llm_model: args.llmModel,
      transcript_model: args.transcriptModel,
      analyzed_at: new Date().toISOString(),
    });
  if (error) {
    throw new Error(`saveCompetitorAnalysis: ${error.message}`);
  }

  const auditWrite = await supabase
    .from("research_analysis_runs")
    .insert({ user_id: args.userId, media_id: args.mediaId });
  if (auditWrite.error) {
    log.warn(
      "research_analysis_runs insert failed (rate limiter under-counts)",
      {
        user_id: args.userId,
        media_id: args.mediaId,
        message: auditWrite.error.message,
      },
    );
  }
}

export async function getAnalysisForCompetitorMedia(
  supabase: CompetitorAnalysisSupabaseClient,
  mediaId: string,
): Promise<MediaAnalysis | null> {
  const { data, error } = await supabase
    .from("competitor_media_analysis")
    .select(
      "transcript, hook, structure, pillar_match, performance_label, what_worked, what_to_repeat",
    )
    .eq("media_id", mediaId)
    .maybeSingle();
  if (error) throw new Error(`getAnalysisForCompetitorMedia: ${error.message}`);
  if (!data) return null;
  return data as MediaAnalysis;
}

/**
 * Bulk fetch by media ids. Used by the /research/[competitorId] page
 * to render analysis state next to each reel tile in one shot.
 */
export async function getAnalysesForCompetitorMediaIds(
  supabase: CompetitorAnalysisSupabaseClient,
  mediaIds: string[],
): Promise<Map<string, MediaAnalysis>> {
  if (mediaIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("competitor_media_analysis")
    .select(
      "media_id, transcript, hook, structure, pillar_match, performance_label, what_worked, what_to_repeat",
    )
    .in("media_id", mediaIds);
  if (error) {
    throw new Error(`getAnalysesForCompetitorMediaIds: ${error.message}`);
  }
  const out = new Map<string, MediaAnalysis>();
  for (const row of data ?? []) {
    const { media_id, ...rest } = row as { media_id: string } & MediaAnalysis;
    out.set(media_id, rest as MediaAnalysis);
  }
  return out;
}
