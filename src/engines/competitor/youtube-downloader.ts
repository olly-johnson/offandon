/**
 * YouTube video downloader: turns a YT watch URL into a fetch-stable
 * mp4 hosted on Apify's key-value store.
 *
 * The list scrapers (streamers~youtube-scraper et al) only return
 * metadata + the watch page URL, which is an HTML document and not
 * what Deepgram can transcribe. A second Apify actor takes that watch
 * URL, downloads the video, uploads the mp4 to KVS, and returns the
 * stable URL in its dataset.
 *
 * Default actor: apify~youtube-video-downloader. Swappable via
 * APIFY_YOUTUBE_DOWNLOADER_ACTOR_ID for operators who want a
 * different extractor (yt-dlp wrappers, mirror actors, etc.).
 */

import { createLogger } from "@/lib/shared/logger";

const log = createLogger("competitor.youtube-downloader");

const APIFY_API_BASE = "https://api.apify.com/v2";
const DEFAULT_ACTOR_ID = "streamers~youtube-video-downloader";

/**
 * Quality cap on the mp4 download. Deepgram only needs the audio
 * track, so the lowest stable quality is fine and meaningfully
 * cheaper: the downloader bills per MB transferred. 480p shorts
 * land around ~3-5 MB ($0.02-0.03 each) vs ~10-15 MB at 720p.
 */
const DEFAULT_QUALITY = "480p";

export interface ApifyYoutubeDownloaderOptions {
  apiKey: string;
  actorId: string;
  fetchImpl?: typeof fetch;
}

export class ApifyYoutubeDownloader {
  private readonly apiKey: string;
  private readonly actorId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApifyYoutubeDownloaderOptions) {
    this.apiKey = opts.apiKey;
    this.actorId = opts.actorId;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(fetchImpl?: typeof fetch): ApifyYoutubeDownloader {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("APIFY_API_KEY is not set");
    }
    const actorId =
      process.env.APIFY_YOUTUBE_DOWNLOADER_ACTOR_ID ?? DEFAULT_ACTOR_ID;
    return new ApifyYoutubeDownloader({ apiKey, actorId, fetchImpl });
  }

  /**
   * Fetches a stable mp4 URL for a YouTube watch URL via the
   * downloader actor's run-sync-get-dataset-items endpoint. Returns
   * null when the actor's dataset is empty (typical for private,
   * age-gated, or pulled videos).
   *
   * Input shape targets streamers~youtube-video-downloader (the
   * Apify-maintained actor): `videos` is the URL list, and
   * `preferredQuality` caps download size. Other downloader actors
   * tend to accept the same `videos` key but some still use
   * `videoUrls` - we send the URL on both for compat; actors with
   * strict JSON-schema validation ignore the duplicate.
   */
  async fetchMediaUrl(watchUrl: string): Promise<string | null> {
    const endpoint = `${APIFY_API_BASE}/acts/${this.actorId}/run-sync-get-dataset-items`;
    const res = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videos: [watchUrl],
        videoUrls: [watchUrl],
        preferredQuality: DEFAULT_QUALITY,
      }),
    });

    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(
        `Apify youtube-video-downloader failed (${res.status}): ${body}`,
      );
    }

    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      log.warn("youtube downloader: empty dataset", { watchUrl });
      return null;
    }

    return parseDownloaderItem(data[0]);
  }
}

/**
 * Pure parser for one downloader output row. Different downloader
 * actors put the resulting URL on different fields; try all the
 * common ones in order of likelihood.
 */
export function parseDownloaderItem(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  const videoFile = stringOrNull(obj.videoFile);
  if (videoFile) return videoFile;

  const videoUrl = stringOrNull(obj.videoUrl);
  if (videoUrl) return videoUrl;

  const mediaUrl = stringOrNull(obj.mediaUrl);
  if (mediaUrl) return mediaUrl;

  if (Array.isArray(obj.mediaUrls) && obj.mediaUrls.length > 0) {
    const first = obj.mediaUrls[0];
    if (typeof first === "string") return stringOrNull(first);
    if (first && typeof first === "object") {
      const url = (first as Record<string, unknown>).url;
      return stringOrNull(url);
    }
  }

  return null;
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
