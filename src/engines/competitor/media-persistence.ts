import { createLogger } from "@/lib/shared/logger";

import type { CompetitorReel } from "./scraper";
import type { CompetitorSupabaseClient } from "./persistence";

const log = createLogger("competitor.media-persistence");

export type { CompetitorSupabaseClient } from "./persistence";

export interface CompetitorMediaRow {
  id: string;
  competitor_id: string;
  user_id: string;
  media_type: "VIDEO" | "REELS" | "IMAGE" | "CAROUSEL_ALBUM";
  caption: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  like_count: number | null;
  comments_count: number | null;
  view_count: number | null;
  duration_seconds: number | null;
  scrape_run_id: string | null;
  synced_at: string;
  analysis_failed_reason: string | null;
  analysis_pending: boolean;
}

const MEDIA_COLUMNS =
  "id, competitor_id, user_id, media_type, caption, permalink, media_url, thumbnail_url, posted_at, like_count, comments_count, view_count, duration_seconds, scrape_run_id, synced_at, analysis_failed_reason, analysis_pending";

export async function upsertCompetitorMedia(
  supabase: CompetitorSupabaseClient,
  args: {
    competitorId: string;
    userId: string;
    scrapeRunId: string;
    reels: CompetitorReel[];
    now?: Date;
  },
): Promise<void> {
  if (args.reels.length === 0) return;
  const stamp = (args.now ?? new Date()).toISOString();
  const rows = args.reels.map((r) => ({
    id: r.id,
    competitor_id: args.competitorId,
    user_id: args.userId,
    media_type: r.media_type,
    caption: r.caption,
    permalink: r.permalink,
    media_url: r.media_url,
    thumbnail_url: r.thumbnail_url,
    posted_at: r.posted_at,
    like_count: r.like_count,
    comments_count: r.comments_count,
    view_count: r.view_count,
    duration_seconds: r.duration_seconds,
    scrape_run_id: args.scrapeRunId,
    synced_at: stamp,
  }));

  const { error } = await supabase
    .from("competitor_media")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    log.error("competitor_media upsert failed", {
      competitor_id: args.competitorId,
      count: rows.length,
      message: error.message,
    });
    throw new Error(`upsertCompetitorMedia: ${error.message}`);
  }
}

export async function listMediaForCompetitor(
  supabase: CompetitorSupabaseClient,
  competitorId: string,
  limit = 30,
): Promise<CompetitorMediaRow[]> {
  const { data, error } = await supabase
    .from("competitor_media")
    .select(MEDIA_COLUMNS)
    .eq("competitor_id", competitorId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`listMediaForCompetitor: ${error.message}`);
  }
  return (data ?? []) as CompetitorMediaRow[];
}

/**
 * Fetch one media row scoped to user_id. Used by the manual
 * analyzeCompetitorMediaAction so we can verify ownership before
 * firing an Inngest event.
 */
export async function getCompetitorMediaForUser(
  supabase: CompetitorSupabaseClient,
  args: { userId: string; mediaId: string },
): Promise<CompetitorMediaRow | null> {
  const { data, error } = await supabase
    .from("competitor_media")
    .select(MEDIA_COLUMNS)
    .eq("id", args.mediaId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) {
    throw new Error(`getCompetitorMediaForUser: ${error.message}`);
  }
  return (data ?? null) as CompetitorMediaRow | null;
}

/**
 * Record an analyzer failure on the media row so the UI can render
 * "Failed: <reason>" with a retry button instead of an infinite
 * spinner. Also clears analysis_pending so the spinner stops. Reason
 * is truncated; full traceback lives in Inngest logs.
 */
export async function setCompetitorMediaAnalysisFailure(
  supabase: CompetitorSupabaseClient,
  args: { mediaId: string; reason: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("competitor_media")
    .update({
      analysis_failed_reason: args.reason?.slice(0, 500) ?? null,
      analysis_pending: false,
    })
    .eq("id", args.mediaId);
  if (error) {
    log.error("competitor_media analysis_failed_reason update failed", {
      media_id: args.mediaId,
      message: error.message,
    });
    // Best-effort: don't crash the worker just because we couldn't
    // surface the failure. The Inngest run will still record the
    // underlying error in its own trace.
  }
}

/**
 * Mark one or more reels as "analysis in flight". Called by the
 * auto-fan-out path (after scrape) and the manual analyze action so
 * the UI tile flips to "Analyzing..." instead of showing the
 * Analyze button. The worker resets it to false on success/failure.
 */
export async function markCompetitorMediaAnalysisPending(
  supabase: CompetitorSupabaseClient,
  args: { mediaIds: string[] },
): Promise<void> {
  if (args.mediaIds.length === 0) return;
  const { error } = await supabase
    .from("competitor_media")
    .update({ analysis_pending: true, analysis_failed_reason: null })
    .in("id", args.mediaIds);
  if (error) {
    log.error("competitor_media analysis_pending update failed", {
      count: args.mediaIds.length,
      message: error.message,
    });
    throw new Error(`markCompetitorMediaAnalysisPending: ${error.message}`);
  }
}

/**
 * Touch the competitor_accounts sync stamps. sync_pending is the
 * authoritative in-flight signal: server action flips it true when
 * emitting the Inngest event, worker flips it back to false on
 * success or failure. last_synced_at + last_sync_error capture the
 * terminal state of the most recent run.
 */
export async function updateCompetitorSyncState(
  supabase: CompetitorSupabaseClient,
  args: {
    competitorId: string;
    userId: string;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
    syncPending: boolean;
  },
): Promise<void> {
  const { error } = await supabase
    .from("competitor_accounts")
    .update({
      last_synced_at: args.lastSyncedAt,
      last_sync_error: args.lastSyncError,
      sync_pending: args.syncPending,
    })
    .eq("id", args.competitorId)
    .eq("user_id", args.userId);

  if (error) {
    log.error("competitor_accounts sync-state update failed", {
      competitor_id: args.competitorId,
      message: error.message,
    });
    throw new Error(`updateCompetitorSyncState: ${error.message}`);
  }
}
