/**
 * Apify-backed profile scraper. Sibling to ApifyCompetitorScraper but
 * for profile-level reads (avatar URL, follower count, bio) instead
 * of reel datasets.
 *
 * Why separate from scraper.ts: the reel scraper uses async runs +
 * webhooks because reel scrapes take 30-90s and we want the worker
 * thread freed. Profile reads finish in 3-10s, so we use the
 * `run-sync-get-dataset-items` endpoint and block on the same call
 * for one round trip.
 *
 * Only Instagram is implemented today; the suggested-creators grid
 * surfaces TT and YT chips but their tracking pipeline isn't built
 * yet, so the matching profile-fetch path is deferred.
 */

import { createLogger } from "@/lib/shared/logger";

const log = createLogger("competitor.profile-scraper");

const APIFY_API_BASE = "https://api.apify.com/v2";
const DEFAULT_INSTAGRAM_PROFILE_ACTOR = "apify~instagram-profile-scraper";

export interface ApifyProfileScraperOptions {
  apiKey: string;
  instagramActorId: string;
  fetchImpl?: typeof fetch;
}

export class ApifyProfileScraper {
  private readonly apiKey: string;
  private readonly instagramActorId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApifyProfileScraperOptions) {
    this.apiKey = opts.apiKey;
    this.instagramActorId = opts.instagramActorId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(fetchImpl?: typeof fetch): ApifyProfileScraper {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("APIFY_API_KEY is not set");
    }
    const instagramActorId =
      process.env.APIFY_INSTAGRAM_PROFILE_ACTOR_ID ??
      DEFAULT_INSTAGRAM_PROFILE_ACTOR;
    return new ApifyProfileScraper({ apiKey, instagramActorId, fetchImpl });
  }

  /**
   * Fetches the avatar URL for an Instagram handle via the
   * instagram-profile-scraper actor. Returns null when the actor
   * returns an empty dataset (handle 404'd, private, or rate
   * limited).
   */
  async fetchInstagramAvatarUrl(rawHandle: string): Promise<string | null> {
    const handle = rawHandle.replace(/^@/, "").trim();
    if (handle === "") return null;

    const url = `${APIFY_API_BASE}/acts/${this.instagramActorId}/run-sync-get-dataset-items`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ usernames: [handle] }),
    });

    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(
        `Apify instagram-profile-scraper failed (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("Apify profile-scraper: expected an array response");
    }
    if (data.length === 0) {
      log.warn("instagram profile: empty dataset", { handle });
      return null;
    }

    const row = data[0] as Record<string, unknown>;
    const hd = stringOrNull(row.profilePicUrlHD);
    if (hd) return hd;
    const fallback = stringOrNull(row.profilePicUrl);
    if (fallback) return fallback;

    log.warn("instagram profile: no profile pic fields", { handle });
    return null;
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
