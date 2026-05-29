import { createLogger, timed } from "@/lib/shared/logger";

import type { ITranscriptionClient, TranscriptionResult } from "./types";

const log = createLogger("research.deepgram");

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/**
 * Pinned model. nova-3 is Deepgram's current default; cheaper and
 * more accurate than nova-2 on short-form content. If we move to a
 * different model, update this string AND existing rows' transcript_model
 * column so reproducibility isn't fudged.
 */
export const DEEPGRAM_MODEL = "deepgram-nova-3";

export interface DeepgramTranscriptionClientOptions {
  apiKey?: string;
  /** Override fetch (used by tests). */
  fetchImpl?: typeof fetch;
  /** Override modelId reported to the DB. Tests may set this; prod doesn't. */
  modelId?: string;
}

/**
 * Production ITranscriptionClient. Posts the audio buffer to
 * Deepgram's /v1/listen endpoint with detect_language=true so the
 * caller doesn't need to know the video's language up front.
 *
 * Wire format: raw audio body, Content-Type signals the codec.
 * Deepgram sniffs the container, so audio/* with the right extension
 * works. We send audio/mp4 because IG Graph delivers reels as MP4.
 */
export class DeepgramTranscriptionClient implements ITranscriptionClient {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DeepgramTranscriptionClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing DEEPGRAM_API_KEY env var. Set it in .env.local (see .env.example).",
      );
    }
    this.apiKey = apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.modelId = opts.modelId ?? DEEPGRAM_MODEL;
  }

  async transcribe(
    audio: ArrayBuffer | Uint8Array,
  ): Promise<TranscriptionResult> {
    const body = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
    const url = new URL(DEEPGRAM_URL);
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("detect_language", "true");
    url.searchParams.set("punctuate", "true");

    return timed(
      log,
      "deepgram.transcribe",
      async () => {
        // Cast through BodyInit to satisfy the fetch type for
        // ArrayBufferView. Node 20+'s fetch accepts Uint8Array directly.
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Token ${this.apiKey}`,
            "Content-Type": "audio/mp4",
          },
          body: body as BodyInit,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "(no body)");
          throw new Error(
            `Deepgram ${res.status}: ${text.slice(0, 200)}`,
          );
        }
        const json = (await res.json()) as DeepgramResponse;
        const transcript = pickTranscript(json);
        if (transcript === null) {
          // No transcript field at all: we couldn't parse Deepgram's
          // output. That's a real failure, distinct from a reel that
          // simply has no speech (handled below as an empty string).
          throw new Error(
            "Deepgram returned a malformed response (no transcript field)",
          );
        }
        // transcript may be "" here: a music-only or visual reel that
        // carries no speech. That's a valid result, not an error. The
        // caller analyses such reels from caption + metrics.
        return {
          text: transcript,
          duration_seconds: json.metadata?.duration ?? null,
        };
      },
      { bytes: body.byteLength },
    );
  }
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
}

/**
 * Returns the transcript string, or null when the response is
 * malformed (the transcript field is missing entirely). An empty/
 * whitespace-only transcript is returned as "" — that's a no-speech
 * reel, a valid outcome the caller handles, not a parse failure.
 */
function pickTranscript(r: DeepgramResponse): string | null {
  const t = r.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof t !== "string") return null;
  return t.trim();
}
