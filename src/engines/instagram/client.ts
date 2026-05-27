/**
 * Thin Instagram Graph API client.
 *
 * Caller supplies a long-lived access token; the client makes the three
 * requests the sync orchestrator needs:
 *   fetchSelf(token)              GET /me              -> account stats
 *   fetchMedia(token, n)          GET /me/media        -> latest n posts
 *   fetchMediaInsights(token, id) GET /{id}/insights   -> per-post metrics
 *
 * Errors:
 *   InstagramTokenError  the token is missing / expired / unauthorized
 *   InstagramApiError    everything else (rate limit, 5xx, malformed)
 *
 * Why a class wrapper around fetch: the sync orchestrator's tests need
 * a swappable client without us reaching into global fetch. The fetch
 * impl is overrideable in the constructor for tests.
 */

import { createLogger } from "@/lib/shared/logger";

const log = createLogger("instagram.client");

const API_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.instagram.com/${API_VERSION}`;

export class InstagramTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstagramTokenError";
  }
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

import type {
  InstagramAccountStats,
  InstagramMediaInsights,
  InstagramMediaRecord,
  InstagramMediaType,
} from "./types";

export interface InstagramClientOptions {
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Override the base URL (useful for record/replay setups). */
  baseUrl?: string;
}

export interface IInstagramClient {
  fetchSelf(token: string): Promise<InstagramAccountStats>;
  fetchMedia(token: string, limit: number): Promise<InstagramMediaRecord[]>;
  fetchMediaInsights(
    token: string,
    mediaId: string,
    mediaType: InstagramMediaType,
  ): Promise<InstagramMediaInsights>;
}

export class InstagramClient implements IInstagramClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: InstagramClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? GRAPH_BASE;
  }

  async fetchSelf(token: string): Promise<InstagramAccountStats> {
    const data = await this.get<{
      id: string;
      username?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
      profile_picture_url?: string;
    }>(token, "/me", {
      fields:
        "id,username,followers_count,follows_count,media_count,profile_picture_url",
    });
    return {
      ig_user_id: data.id,
      username: data.username ?? null,
      followers_count: data.followers_count ?? null,
      follows_count: data.follows_count ?? null,
      media_count: data.media_count ?? null,
      profile_picture_url: data.profile_picture_url ?? null,
    };
  }

  async fetchMedia(token: string, limit: number): Promise<InstagramMediaRecord[]> {
    const data = await this.get<{
      data?: Array<{
        id: string;
        media_type?: string;
        caption?: string;
        permalink?: string;
        media_url?: string;
        thumbnail_url?: string;
        timestamp?: string;
        like_count?: number;
        comments_count?: number;
      }>;
    }>(token, "/me/media", {
      fields:
        "id,media_type,caption,permalink,media_url,thumbnail_url,timestamp,like_count,comments_count",
      limit: String(limit),
    });

    return (data.data ?? []).map((row) => ({
      id: row.id,
      media_type: normaliseMediaType(row.media_type),
      caption: row.caption ?? null,
      permalink: row.permalink ?? null,
      media_url: row.media_url ?? null,
      thumbnail_url: row.thumbnail_url ?? null,
      posted_at: row.timestamp ?? null,
      like_count: row.like_count ?? null,
      comments_count: row.comments_count ?? null,
    }));
  }

  async fetchMediaInsights(
    token: string,
    mediaId: string,
    mediaType: InstagramMediaType,
  ): Promise<InstagramMediaInsights> {
    // IG only supports certain metrics per media_type.
    //   IMAGE / CAROUSEL_ALBUM: reach, saved, shares
    //   VIDEO / REELS:          reach, views, saved, shares
    // The `plays` metric was deprecated (consolidated into `views`) and
    // is rejected on current API versions. Asking for ANY unsupported
    // metric makes the whole /insights call 400 with an OAuthException,
    // which zeroes out every metric, so we keep this list current and
    // tailor it per type.
    const metrics =
      mediaType === "VIDEO" || mediaType === "REELS"
        ? "reach,views,saved,shares"
        : "reach,saved,shares";

    const empty: InstagramMediaInsights = {
      reach: null,
      plays: null,
      saved: null,
      shares: null,
    };

    let data: {
      data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
    };
    try {
      data = await this.get(token, `/${mediaId}/insights`, { metric: metrics });
    } catch (err) {
      // Insights can fail for older posts or unsupported types. Don't
      // poison the whole sync; return nulls. But log it: a silent
      // swallow here is exactly what hid the deprecated-`plays` 400 for
      // weeks, leaving every reach/views/saves/shares cell as N/A.
      if (err instanceof InstagramApiError) {
        log.warn("instagram insights request failed, returning nulls", {
          media_id: mediaId,
          media_type: mediaType,
          status: err.status,
          error: err.message,
        });
        return empty;
      }
      throw err;
    }

    const out: InstagramMediaInsights = { ...empty };
    for (const m of data.data ?? []) {
      const value = m.values?.[0]?.value ?? null;
      switch (m.name) {
        case "reach":
          out.reach = value;
          break;
        // `views` is the current name for what we still store as `plays`
        // (the DB column + dashboard "Video Views" cell read `plays`).
        case "views":
          out.plays = value;
          break;
        case "saved":
          out.saved = value;
          break;
        case "shares":
          out.shares = value;
          break;
      }
    }
    return out;
  }

  private async get<T>(
    token: string,
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", token);

    const res = await this.fetchImpl(url.toString(), { method: "GET" });
    if (res.status === 401 || res.status === 403) {
      throw new InstagramTokenError(
        `Instagram token rejected (HTTP ${res.status}).`,
      );
    }
    if (!res.ok) {
      const text = await safeText(res);
      throw new InstagramApiError(
        `Instagram API error (${res.status}): ${text}`,
        res.status,
      );
    }
    return (await res.json()) as T;
  }
}

function normaliseMediaType(raw: string | undefined): InstagramMediaType {
  if (raw === "IMAGE" || raw === "VIDEO" || raw === "CAROUSEL_ALBUM" || raw === "REELS") {
    return raw;
  }
  // IG returns VIDEO for legacy reels; treat unknown values as IMAGE so we
  // don't crash the sync. The check constraint on the DB enforces the enum.
  return "IMAGE";
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
