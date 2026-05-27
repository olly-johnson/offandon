/**
 * Instagram integration: public type surface.
 *
 * The engine has two layers:
 *   client.ts      a thin wrapper around the IG Graph API
 *   persistence.ts read/write the connection + media tables
 *   sync.ts        orchestrator: pull from client, push to persistence
 *
 * Types here are shared by all three.
 */

export type InstagramMediaType =
  | "IMAGE"
  | "VIDEO"
  | "CAROUSEL_ALBUM"
  | "REELS";

/** Top-level account stats fetched in one call. */
export interface InstagramAccountStats {
  ig_user_id: string;
  username: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  /** Short-lived CDN URL for the account avatar. Refreshed each sync. */
  profile_picture_url: string | null;
}

/** One row returned by the IG /media endpoint, before we attach insights. */
export interface InstagramMediaRecord {
  id: string;
  media_type: InstagramMediaType;
  caption: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  like_count: number | null;
  comments_count: number | null;
}

/** Per-media metrics fetched from /insights. */
export interface InstagramMediaInsights {
  reach: number | null;
  plays: number | null;
  saved: number | null;
  shares: number | null;
}

/** What we persist after merging media + insights. */
export interface InstagramMediaFull extends InstagramMediaRecord, InstagramMediaInsights {}
