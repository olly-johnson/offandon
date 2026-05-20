/**
 * Apify-backed competitor scraper. Used by BO-062 to pull reels for a
 * tracked competitor handle. The flow is:
 *
 *   1. Server action / Inngest worker calls startReelScrape({username})
 *      which POSTs to /v2/acts/<actor>/runs with our API key + a
 *      webhook config that fires when the run finishes.
 *   2. Apify runs the actor (instagram-reel-scraper by default) and
 *      writes results to a default dataset for that run.
 *   3. On completion Apify POSTs our webhook with the payload template
 *      we supplied (includes competitor_id + user_id + dataset id).
 *   4. The webhook emits an Inngest event; the consumer calls
 *      fetchDatasetItems(datasetId), parses with parseReelItem, and
 *      upserts to competitor_media.
 *
 * Why we don't poll Apify run status: a single Vercel serverless invoc
 * doesn't outlive a typical scrape (~30-90s). Webhooks let Inngest fan
 * out cleanly.
 */

import { createLogger } from "@/lib/shared/logger";

const log = createLogger("competitor.scraper");

const APIFY_API_BASE = "https://api.apify.com/v2";
const DEFAULT_ACTOR_ID = "apify~instagram-reel-scraper";

export class ApifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyConfigError";
  }
}

export interface ApifyConfig {
  apiKey: string;
  webhookSecret: string;
  actorId: string;
}

/**
 * Load Apify config from env. The variable name is APIFY_API_KEY (not
 * APIFY_TOKEN — that's Apify's docs convention; ours matches Vercel).
 * APIFY_ACTOR_ID falls back to the official reel scraper so day-1
 * setup is one env var.
 */
export function loadApifyConfig(): ApifyConfig {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new ApifyConfigError("APIFY_API_KEY is not set");
  }
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.trim() === "") {
    throw new ApifyConfigError("APIFY_WEBHOOK_SECRET is not set");
  }
  const actorId = process.env.APIFY_ACTOR_ID ?? DEFAULT_ACTOR_ID;
  return { apiKey, webhookSecret, actorId };
}

export interface CompetitorReel {
  id: string;
  media_type: "REELS";
  caption: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  like_count: number | null;
  comments_count: number | null;
  view_count: number | null;
  duration_seconds: number | null;
}

export interface ReelScraperRunMetadata {
  competitor_id: string;
  user_id: string;
}

export interface ReelScraperActorInput {
  username: string[];
  resultsLimit: number;
}

export interface ReelScraperWebhookConfig {
  eventTypes: string[];
  requestUrl: string;
  headersTemplate: string;
  payloadTemplate: string;
}

export interface ReelScraperRunBody {
  /** Goes in the POST body — actor input only, never webhooks. */
  input: ReelScraperActorInput;
  /** Goes in the ?webhooks= query param, base64url-encoded. */
  webhooks: ReelScraperWebhookConfig[];
}

export interface BuildReelScraperInputArgs {
  username: string;
  resultsLimit: number;
  webhookUrl: string;
  webhookSecret: string;
  runMetadata: ReelScraperRunMetadata;
}

/**
 * Pure builder for an Apify run request. Returns { input, webhooks }
 * separately because Apify's API takes the actor input as the request
 * body but ad-hoc webhooks as a base64url-encoded `webhooks` query
 * parameter — putting webhooks inside the body silently fails because
 * the actor just treats unknown fields as ignored input.
 */
export function buildReelScraperInput(
  args: BuildReelScraperInputArgs,
): ReelScraperRunBody {
  return {
    input: {
      username: [args.username],
      resultsLimit: args.resultsLimit,
    },
    webhooks: [
      {
        eventTypes: [
          "ACTOR.RUN.SUCCEEDED",
          "ACTOR.RUN.FAILED",
          "ACTOR.RUN.ABORTED",
          "ACTOR.RUN.TIMED_OUT",
        ],
        requestUrl: args.webhookUrl,
        // Apify lets us inject custom headers on the webhook. We send a
        // shared secret so /api/apify/webhook can reject impostors with
        // a constant-time check.
        headersTemplate: JSON.stringify({
          "X-Apify-Webhook-Token": args.webhookSecret,
        }),
        // Apify interpolates {{ }} placeholders against the run
        // resource at delivery time. We piggyback our own correlation
        // ids so the webhook handler can route the result back to the
        // right competitor without an extra Apify roundtrip.
        payloadTemplate: JSON.stringify({
          competitor_id: args.runMetadata.competitor_id,
          user_id: args.runMetadata.user_id,
          actorRunId: "{{resource.id}}",
          datasetId: "{{resource.defaultDatasetId}}",
          status: "{{eventType}}",
        }),
      },
    ],
  };
}

/**
 * base64url-encode the webhooks config for the `?webhooks=` query
 * parameter. Apify uses URL-safe base64 (RFC 4648 §5): `-` for `+`,
 * `_` for `/`, no padding.
 */
export function encodeWebhooksParam(
  webhooks: ReelScraperWebhookConfig[],
): string {
  return Buffer.from(JSON.stringify(webhooks), "utf8").toString("base64url");
}

export interface ReelScraperStartResult {
  actorRunId: string;
  defaultDatasetId: string;
}

export interface ApifyCompetitorScraperOptions {
  apiKey: string;
  webhookSecret: string;
  actorId: string;
  fetchImpl?: typeof fetch;
}

export class ApifyCompetitorScraper {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly actorId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApifyCompetitorScraperOptions) {
    this.apiKey = opts.apiKey;
    this.webhookSecret = opts.webhookSecret;
    this.actorId = opts.actorId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(fetchImpl?: typeof fetch): ApifyCompetitorScraper {
    const cfg = loadApifyConfig();
    return new ApifyCompetitorScraper({ ...cfg, fetchImpl });
  }

  async startReelScrape(args: {
    username: string;
    resultsLimit: number;
    webhookUrl: string;
    runMetadata: ReelScraperRunMetadata;
  }): Promise<ReelScraperStartResult> {
    const run = buildReelScraperInput({
      username: args.username,
      resultsLimit: args.resultsLimit,
      webhookUrl: args.webhookUrl,
      webhookSecret: this.webhookSecret,
      runMetadata: args.runMetadata,
    });

    const webhooksParam = encodeWebhooksParam(run.webhooks);
    const url = `${APIFY_API_BASE}/acts/${this.actorId}/runs?webhooks=${webhooksParam}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(run.input),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`Apify start run failed (${res.status}): ${text}`);
    }
    const payload = (await res.json()) as {
      data?: { id?: string; defaultDatasetId?: string };
    };
    const id = payload.data?.id;
    const defaultDatasetId = payload.data?.defaultDatasetId;
    if (!id || !defaultDatasetId) {
      throw new Error(`Apify start run returned no id/dataset (${res.status})`);
    }
    log.info("apify reel scrape started", {
      username: args.username,
      actor_run_id: id,
      dataset_id: defaultDatasetId,
    });
    return { actorRunId: id, defaultDatasetId };
  }

  async fetchDatasetItems(datasetId: string): Promise<CompetitorReel[]> {
    const url = `${APIFY_API_BASE}/datasets/${datasetId}/items?clean=true&format=json`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`Apify fetch dataset failed (${res.status}): ${text}`);
    }
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw)) {
      throw new Error("Apify dataset items: expected an array");
    }

    const out: CompetitorReel[] = [];
    for (const item of raw) {
      const parsed = parseReelItem(item);
      if (parsed) out.push(parsed);
    }
    return out;
  }
}

/**
 * Pure parser for one Apify result row. Returns null for anything that
 * isn't a reel-shaped video so the caller can `out.push(parsed)` and
 * drop silently. Apify's response shape is documented but loosely typed.
 */
export function parseReelItem(item: unknown): CompetitorReel | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  const shortCode = typeof obj.shortCode === "string" ? obj.shortCode : null;
  if (!shortCode) return null;

  const type = typeof obj.type === "string" ? obj.type : null;
  // Reels show up as type === "Video". Filter the rest so we don't
  // burn Deepgram on photo carousels.
  if (type !== "Video") return null;

  return {
    id: shortCode,
    media_type: "REELS",
    caption: stringOrNull(obj.caption),
    permalink: stringOrNull(obj.url),
    media_url: stringOrNull(obj.videoUrl),
    thumbnail_url: stringOrNull(obj.displayUrl),
    posted_at: stringOrNull(obj.timestamp),
    like_count: numberOrNull(obj.likesCount),
    comments_count: numberOrNull(obj.commentsCount),
    view_count: numberOrNull(obj.videoPlayCount),
    duration_seconds: numberOrNull(obj.videoDuration),
  };
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

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
