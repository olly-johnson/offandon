/**
 * Multi-platform Apify scrape orchestration.
 *
 * Wraps the existing IG-only ApifyCompetitorScraper with a platform-
 * aware dispatch layer. Each platform owns:
 *   - an Apify actor id (env-overridable, sensible default)
 *   - an input builder that shapes the actor's payload
 *   - a dataset parser that returns CompetitorReel rows
 *
 * The webhook flow is shared: every run posts back to
 * /api/apify/webhook with a base64url-encoded ?webhooks= param + the
 * standard correlation IDs in the URL. The completed handler reads
 * competitor.platform from the DB and routes to the right parser
 * here.
 *
 * Adding a fourth platform means: bump actor id constant, add an
 * input builder, add a parser, add a test case. Nothing else.
 */

import type { CompetitorPlatform } from "./persistence";
import {
  encodeWebhooksParam,
  parseReelItem as parseInstagramItem,
  type CompetitorReel,
  type ReelScraperWebhookConfig,
} from "./scraper";

const DEFAULT_ACTOR_IDS: Record<CompetitorPlatform, string> = {
  instagram: "apify~instagram-reel-scraper",
  tiktok: "clockworks~tiktok-scraper",
  youtube_shorts: "streamers~youtube-scraper",
};

const ENV_KEYS: Record<CompetitorPlatform, string> = {
  instagram: "APIFY_ACTOR_ID",
  tiktok: "APIFY_TIKTOK_ACTOR_ID",
  youtube_shorts: "APIFY_YOUTUBE_ACTOR_ID",
};

export type CompetitorReelInProgress = CompetitorReel;

export interface ScrapeRequestArgs {
  platform: CompetitorPlatform;
  username: string;
  resultsLimit: number;
  webhookUrl: string;
  webhookSecret: string;
  runMetadata: { competitor_id: string; user_id: string };
}

export interface ScrapeRequest {
  actorId: string;
  input: Record<string, unknown>;
  webhooks: ReelScraperWebhookConfig[];
}

/**
 * Resolve the actor id for a platform with env override fallback. So
 * `APIFY_TIKTOK_ACTOR_ID=foo~bar` swaps the TT scraper without code
 * change.
 */
export function resolveActorId(platform: CompetitorPlatform): string {
  const envKey = ENV_KEYS[platform];
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.trim() !== "") return fromEnv;
  return DEFAULT_ACTOR_IDS[platform];
}

export function buildScrapeRequest(args: ScrapeRequestArgs): ScrapeRequest {
  const actorId = resolveActorId(args.platform);
  const webhooks = buildWebhookConfig(args);
  const input =
    args.platform === "instagram"
      ? buildInstagramInput(args)
      : args.platform === "tiktok"
        ? buildTiktokInput(args)
        : buildYoutubeInput(args);
  return { actorId, input, webhooks };
}

function buildWebhookConfig(args: ScrapeRequestArgs): ReelScraperWebhookConfig[] {
  const url = new URL(args.webhookUrl);
  url.searchParams.set("competitor_id", args.runMetadata.competitor_id);
  url.searchParams.set("user_id", args.runMetadata.user_id);
  url.searchParams.set("platform", args.platform);
  return [
    {
      eventTypes: [
        "ACTOR.RUN.SUCCEEDED",
        "ACTOR.RUN.FAILED",
        "ACTOR.RUN.ABORTED",
        "ACTOR.RUN.TIMED_OUT",
      ],
      requestUrl: url.toString(),
      headersTemplate: JSON.stringify({
        "X-Apify-Webhook-Token": args.webhookSecret,
      }),
    },
  ];
}

function buildInstagramInput(args: ScrapeRequestArgs): Record<string, unknown> {
  return {
    username: [args.username],
    resultsLimit: args.resultsLimit,
  };
}

function buildTiktokInput(args: ScrapeRequestArgs): Record<string, unknown> {
  // clockworks~tiktok-scraper: `profiles` accepts bare handles; the
  // actor resolves them to https://tiktok.com/@handle internally.
  return {
    profiles: [args.username],
    resultsPerPage: args.resultsLimit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
  };
}

function buildYoutubeInput(args: ScrapeRequestArgs): Record<string, unknown> {
  // streamers~youtube-scraper: feed a /@handle/shorts URL so the
  // crawler stays on the shorts tab instead of mixing long-form
  // videos into the dataset.
  return {
    startUrls: [
      { url: `https://www.youtube.com/@${args.username}/shorts` },
    ],
    maxResults: args.resultsLimit,
    maxResultsShorts: args.resultsLimit,
  };
}

/** Convenience: build the same `?webhooks=` payload encoder Apify expects. */
export function buildScrapeUrl(
  apiBase: string,
  request: ScrapeRequest,
): string {
  const webhooksParam = encodeWebhooksParam(request.webhooks);
  return `${apiBase}/acts/${request.actorId}/runs?webhooks=${webhooksParam}`;
}

export function parseScrapeItem(
  platform: CompetitorPlatform,
  item: unknown,
): CompetitorReel | null {
  if (platform === "instagram") return parseInstagramItem(item);
  if (platform === "tiktok") return parseTiktokItem(item);
  if (platform === "youtube_shorts") return parseYoutubeItem(item);
  return null;
}

function parseTiktokItem(item: unknown): CompetitorReel | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const id = stringOrNull(obj.id);
  if (!id) return null;

  const videoMeta = (obj.videoMeta ?? {}) as Record<string, unknown>;
  return {
    id,
    media_type: "REELS",
    caption: stringOrNull(obj.text),
    permalink: stringOrNull(obj.webVideoUrl),
    media_url:
      stringOrNull(videoMeta.downloadAddr) ??
      stringOrNull(videoMeta.playAddr) ??
      stringOrNull(obj.mediaUrl),
    thumbnail_url:
      stringOrNull(videoMeta.coverUrl) ??
      stringOrNull(videoMeta.originalCoverUrl) ??
      stringOrNull(obj.coverUrl),
    posted_at: stringOrNull(obj.createTimeISO),
    like_count: numberOrNull(obj.diggCount),
    comments_count: numberOrNull(obj.commentCount),
    view_count: numberOrNull(obj.playCount),
    duration_seconds: numberOrNull(videoMeta.duration ?? obj.duration),
  };
}

function parseYoutubeItem(item: unknown): CompetitorReel | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const id = stringOrNull(obj.id) ?? stringOrNull(obj.videoId);
  if (!id) return null;

  const permalink =
    stringOrNull(obj.url) ??
    stringOrNull(obj.videoUrl) ??
    `https://www.youtube.com/shorts/${id}`;

  return {
    id,
    media_type: "REELS",
    caption: stringOrNull(obj.title) ?? stringOrNull(obj.description),
    permalink,
    media_url: stringOrNull(obj.url) ?? stringOrNull(obj.videoUrl),
    thumbnail_url:
      stringOrNull(obj.thumbnailUrl) ??
      stringOrNull(obj.thumbnail) ??
      pickThumbnail(obj.thumbnails),
    posted_at:
      stringOrNull(obj.date) ??
      stringOrNull(obj.publishedAt) ??
      stringOrNull(obj.uploadDate),
    like_count: numberOrNull(obj.likes ?? obj.likeCount),
    comments_count: numberOrNull(obj.commentsCount ?? obj.commentCount),
    view_count: numberOrNull(obj.viewCount ?? obj.views),
    duration_seconds: numberOrNull(obj.duration),
  };
}

function pickThumbnail(v: unknown): string | null {
  // Some YT scrapers return thumbnails as an array of { url, width }
  // objects ordered low-to-high; we want the largest/last one.
  if (!Array.isArray(v) || v.length === 0) return null;
  const last = v[v.length - 1];
  if (last && typeof last === "object") {
    const url = (last as Record<string, unknown>).url;
    return stringOrNull(url);
  }
  return null;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}
