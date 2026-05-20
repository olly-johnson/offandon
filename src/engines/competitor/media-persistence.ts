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
}

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
    .select(
      "id, competitor_id, user_id, media_type, caption, permalink, media_url, thumbnail_url, posted_at, like_count, comments_count, view_count, duration_seconds, scrape_run_id, synced_at",
    )
    .eq("competitor_id", competitorId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw new Error(`listMediaForCompetitor: ${error.message}`);
  }
  return (data ?? []) as CompetitorMediaRow[];
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
