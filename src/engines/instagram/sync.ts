import { createLogger } from "@/lib/shared/logger";

import {
  InstagramApiError,
  InstagramTokenError,
  type IInstagramClient,
} from "./client";
import {
  recordFollowerSnapshot,
  upsertConnection,
  upsertMedia,
  type InstagramSupabaseClient,
} from "./persistence";
import type { InstagramMediaFull } from "./types";

const log = createLogger("instagram.sync");

export const DEFAULT_MEDIA_LIMIT = 24;

export interface SyncResult {
  ok: boolean;
  mediaCount: number;
  followersCount: number | null;
  error?: string;
}

/**
 * Pull everything we need for the dashboard + library in one pass:
 *   1. /me           -> top-level stats (followers, media_count, username)
 *   2. /me/media     -> latest N posts with caption + engagement
 *   3. /{id}/insights for each   -> reach / plays / saved / shares
 *
 * Persists the connection (with last_synced_at = now) and the media rows.
 * On TokenError we still record the failure so the UI can show "reconnect";
 * on transient API errors we record last_sync_error but don't drop the
 * existing rows so the user keeps seeing their old library.
 */
export async function runInstagramSync(args: {
  supabase: InstagramSupabaseClient;
  client: IInstagramClient;
  userId: string;
  accessToken: string;
  mediaLimit?: number;
  now?: Date;
}): Promise<SyncResult> {
  const now = args.now ?? new Date();
  const mediaLimit = args.mediaLimit ?? DEFAULT_MEDIA_LIMIT;

  let stats;
  try {
    stats = await args.client.fetchSelf(args.accessToken);
  } catch (err) {
    return await recordError(args, err, now, null);
  }

  let media;
  try {
    media = await args.client.fetchMedia(args.accessToken, mediaLimit);
  } catch (err) {
    return await recordError(args, err, now, stats.followers_count);
  }

  // Insights, one per media. We run them sequentially because IG rate
  // limits are tight and the API doesn't have a batch endpoint we can
  // hit without page tokens. mediaLimit defaults to 24 so this is
  // fine in practice.
  const enriched: InstagramMediaFull[] = [];
  for (const row of media) {
    try {
      const insights = await args.client.fetchMediaInsights(
        args.accessToken,
        row.id,
        row.media_type,
      );
      enriched.push({ ...row, ...insights });
    } catch (err) {
      // One bad insights call shouldn't kill the whole sync. Persist
      // the media without insights.
      log.warn("instagram insights failed for one media", {
        media_id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      enriched.push({
        ...row,
        reach: null,
        plays: null,
        saved: null,
        shares: null,
      });
    }
  }

  try {
    await upsertMedia(args.supabase, {
      userId: args.userId,
      rows: enriched,
      now,
    });
    await upsertConnection(args.supabase, {
      userId: args.userId,
      accessToken: args.accessToken,
      stats,
      lastSyncedAt: now.toISOString(),
      lastSyncError: null,
    });
    // One-per-day follower snapshot. Powers the dashboard's
    // New Followers (30d) metric, which can't be derived from
    // instagram_connections.followers_count alone because that column
    // is mutated in place on every sync.
    await recordFollowerSnapshot(args.supabase, {
      userId: args.userId,
      followersCount: stats.followers_count,
      now,
    });
  } catch (err) {
    log.error("instagram sync persist failed", {
      user_id: args.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      mediaCount: 0,
      followersCount: stats.followers_count,
      error: err instanceof Error ? err.message : "persist failed",
    };
  }

  log.info("instagram sync ok", {
    user_id: args.userId,
    media_count: enriched.length,
    followers: stats.followers_count,
  });

  return {
    ok: true,
    mediaCount: enriched.length,
    followersCount: stats.followers_count,
  };
}

async function recordError(
  args: {
    supabase: InstagramSupabaseClient;
    userId: string;
    accessToken: string;
  },
  err: unknown,
  now: Date,
  followersCount: number | null,
): Promise<SyncResult> {
  const message = err instanceof Error ? err.message : String(err);
  const isToken = err instanceof InstagramTokenError;
  const isApi = err instanceof InstagramApiError;
  log.warn("instagram sync error, recording on connection", {
    user_id: args.userId,
    is_token: isToken,
    is_api: isApi,
    error: message,
  });

  // Persist the failure on the connection row so the UI can surface it.
  // We don't have fresh stats so use a minimal stats stub; do NOT clear
  // any existing followers_count -- leave whatever was last good.
  try {
    await upsertConnection(args.supabase, {
      userId: args.userId,
      accessToken: args.accessToken,
      stats: {
        ig_user_id: "",
        username: null,
        followers_count: null,
        follows_count: null,
        media_count: null,
        profile_picture_url: null,
      },
      lastSyncedAt: null,
      lastSyncError: message,
    });
  } catch (persistErr) {
    log.error("instagram sync: could not record error on connection", {
      user_id: args.userId,
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  }

  return {
    ok: false,
    mediaCount: 0,
    followersCount,
    error: message,
  };
}
