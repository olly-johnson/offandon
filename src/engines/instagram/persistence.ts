import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type {
  InstagramAccountStats,
  InstagramMediaFull,
  InstagramMediaType,
} from "./types";

const log = createLogger("instagram.persistence");

export type InstagramSupabaseClient = SupabaseClient<Database>;

/** Manual-refresh + dashboard cache window. */
export const SYNC_CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ConnectionRow {
  user_id: string;
  access_token: string;
  ig_user_id: string;
  ig_username: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

export interface MediaRow {
  id: string;
  media_type: InstagramMediaType;
  caption: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  like_count: number | null;
  comments_count: number | null;
  reach: number | null;
  plays: number | null;
  saved: number | null;
  shares: number | null;
  synced_at: string;
}

/**
 * Pure helper. True when `last_synced_at` (ISO) is within
 * SYNC_CACHE_WINDOW_MS of `now`. False when null or stale. Used by the
 * manual-refresh action to enforce the 24h cache without re-hitting IG.
 */
export function isConnectionFresh(
  lastSyncedAt: string | null,
  now: Date,
): boolean {
  if (!lastSyncedAt) return false;
  const last = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < SYNC_CACHE_WINDOW_MS;
}

export async function getConnection(
  supabase: InstagramSupabaseClient,
  userId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("instagram_connections")
    .select(
      "user_id, access_token, ig_user_id, ig_username, followers_count, follows_count, media_count, last_synced_at, last_sync_error",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error("instagram_connections select failed", {
      user_id: userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`getConnection: ${error.message}`);
  }
  return (data ?? null) as ConnectionRow | null;
}

export async function upsertConnection(
  supabase: InstagramSupabaseClient,
  args: {
    userId: string;
    accessToken: string;
    stats: InstagramAccountStats;
    lastSyncedAt: string | null;
    lastSyncError?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("instagram_connections")
    .upsert(
      {
        user_id: args.userId,
        access_token: args.accessToken,
        ig_user_id: args.stats.ig_user_id,
        ig_username: args.stats.username,
        followers_count: args.stats.followers_count,
        follows_count: args.stats.follows_count,
        media_count: args.stats.media_count,
        last_synced_at: args.lastSyncedAt,
        last_sync_error: args.lastSyncError ?? null,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    log.error("instagram_connections upsert failed", {
      user_id: args.userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`upsertConnection: ${error.message}`);
  }
}

export async function deleteConnection(
  supabase: InstagramSupabaseClient,
  userId: string,
): Promise<void> {
  // Wipe media rows first. Without this, a future Reconnect (especially
  // via OAuth, where the post mix may shift) can hit RLS UPDATE-policy
  // failures on conflicting media ids from a stale session. Disconnect
  // means "clean slate"; the next sync rebuilds the library anyway.
  const { error: mediaErr } = await supabase
    .from("instagram_media")
    .delete()
    .eq("user_id", userId);
  if (mediaErr) {
    log.error("instagram_media delete failed during disconnect", {
      user_id: userId,
      message: mediaErr.message,
    });
    throw new Error(`deleteConnection (media wipe): ${mediaErr.message}`);
  }

  const { error } = await supabase
    .from("instagram_connections")
    .delete()
    .eq("user_id", userId);
  if (error) {
    log.error("instagram_connections delete failed", {
      user_id: userId,
      message: error.message,
    });
    throw new Error(`deleteConnection: ${error.message}`);
  }
}

export async function upsertMedia(
  supabase: InstagramSupabaseClient,
  args: {
    userId: string;
    rows: InstagramMediaFull[];
    /** Override the sync timestamp; defaults to now. */
    now?: Date;
  },
): Promise<void> {
  if (args.rows.length === 0) return;
  const stamp = (args.now ?? new Date()).toISOString();
  const payload = args.rows.map((r) => ({
    id: r.id,
    user_id: args.userId,
    media_type: r.media_type,
    caption: r.caption,
    permalink: r.permalink,
    media_url: r.media_url,
    thumbnail_url: r.thumbnail_url,
    posted_at: r.posted_at,
    like_count: r.like_count,
    comments_count: r.comments_count,
    reach: r.reach,
    plays: r.plays,
    saved: r.saved,
    shares: r.shares,
    synced_at: stamp,
  }));

  const { error } = await supabase
    .from("instagram_media")
    .upsert(payload, { onConflict: "id" });
  if (error) {
    log.error("instagram_media upsert failed", {
      user_id: args.userId,
      count: payload.length,
      message: error.message,
    });
    throw new Error(`upsertMedia: ${error.message}`);
  }
}

export async function listMediaForUser(
  supabase: InstagramSupabaseClient,
  userId: string,
  limit = 24,
): Promise<MediaRow[]> {
  const { data, error } = await supabase
    .from("instagram_media")
    .select(
      "id, media_type, caption, permalink, media_url, thumbnail_url, posted_at, like_count, comments_count, reach, plays, saved, shares, synced_at",
    )
    .eq("user_id", userId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`listMediaForUser: ${error.message}`);
  return (data ?? []) as MediaRow[];
}
