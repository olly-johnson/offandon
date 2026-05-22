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
 * Per-run memory cap, in megabytes. The downloader actor defaults
 * to 4096 MB which eats half of the free-tier 8 GB concurrent-run
 * budget per call. mp3 extraction is light - 2048 MB has run fine
 * in practice and lets four scrapes run side by side without
 * tripping Apify's actor-memory-limit-exceeded 402.
 *
 * Override via APIFY_YOUTUBE_DOWNLOADER_MEMORY_MB if the actor
 * starts OOMing on longer videos.
 */
const DEFAULT_MEMORY_MB = 2048;

/**
 * Output format. mp3 is audio-only, which is all Deepgram needs;
 * skipping the video stream brings the per-reel download from
 * ~2-3 MB (mp4 at 360p) to ~300-500 KB. Same transcript quality,
 * roughly 85% cheaper on the downloader's per-MB bill.
 */
const DEFAULT_FORMAT = "mp3";

/**
 * Quality cap. Still passed because the actor uses it to pick the
 * source variant before stripping to audio - lower quality source
 * means a tighter audio mux. 360p is the lowest tier where YouTube
 * reliably ships a usable audio track.
 */
const DEFAULT_QUALITY = "360p";

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
   * Fetches a stable audio URL for a YouTube watch URL via the
   * downloader actor's run-sync-get-dataset-items endpoint. Returns
   * null when the actor's dataset is empty (typical for private,
   * age-gated, or pulled videos).
   *
   * Input shape matches streamers~youtube-video-downloader exactly:
   *   - videos:        [{ url }]   array of objects, not bare strings
   *   - preferredFormat: "mp3"     audio-only output for Deepgram
   *   - preferredQuality: "360p"   source variant before mp3 strip
   *   - storeInKVStore: true       persist output, return stable URL
   */
  async fetchMediaUrl(watchUrl: string): Promise<string | null> {
    const memoryMb = resolveMemoryMb();
    const endpoint = `${APIFY_API_BASE}/acts/${this.actorId}/run-sync-get-dataset-items?memory=${memoryMb}`;
    const res = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        videos: [{ url: watchUrl }],
        preferredFormat: DEFAULT_FORMAT,
        preferredQuality: DEFAULT_QUALITY,
        storeInKVStore: true,
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

function resolveMemoryMb(): number {
  const fromEnv = process.env.APIFY_YOUTUBE_DOWNLOADER_MEMORY_MB;
  if (fromEnv && fromEnv.trim() !== "") {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MEMORY_MB;
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
