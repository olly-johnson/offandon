/**
 * Thin HTTP client for the Fathom REST API.
 *
 * We only need one call: fetch a recording by id with its transcript and
 * basic metadata. The webhook gives us enough to know a recording is ready
 * + which user it belongs to; the API gives us the full transcript that
 * we then chunk + embed.
 *
 * Auth header pattern: `Authorization: Bearer <api_key>` (Fathom's
 * standard). Base URL is configurable so a stub can point at a local
 * fixture server during integration tests; the production default is
 * https://api.fathom.ai/external/v1.
 */

import { createLogger } from "@/lib/shared/logger";

import type { FathomInvitee, FathomRecording, IFathomClient } from "./types";

const log = createLogger("fathom.client");

export const FATHOM_API_BASE_URL = "https://api.fathom.ai/external/v1";

export interface FathomApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface RawRecording {
  id?: string;
  recording_id?: string;
  title?: string;
  meeting_title?: string;
  started_at?: string;
  start_time?: string;
  duration_seconds?: number;
  duration?: number;
  invitees?: Array<{ email?: string; name?: string | null }>;
  attendees?: Array<{ email?: string; name?: string | null }>;
  transcript_plaintext?: string;
  transcript?: string;
  share_url?: string;
  recording_url?: string;
  summary?: string;
  ai_summary?: string;
}

function normaliseInvitees(raw: RawRecording): FathomInvitee[] {
  const src = raw.invitees ?? raw.attendees ?? [];
  const out: FathomInvitee[] = [];
  for (const entry of src) {
    if (!entry?.email) continue;
    out.push({
      email: entry.email.toLowerCase().trim(),
      name: entry.name ?? null,
    });
  }
  return out;
}

function normaliseRecording(raw: RawRecording): FathomRecording {
  const recordingId = raw.id ?? raw.recording_id;
  const startedAt = raw.started_at ?? raw.start_time;
  const transcript = raw.transcript_plaintext ?? raw.transcript;

  if (!recordingId) throw new Error("fathom api response missing recording id");
  if (!startedAt) throw new Error("fathom api response missing started_at");
  if (!transcript || transcript.trim().length === 0) {
    throw new Error("fathom api response missing transcript");
  }

  return {
    recordingId,
    title: raw.title ?? raw.meeting_title ?? "Untitled call",
    startedAt,
    durationSeconds: raw.duration_seconds ?? raw.duration,
    invitees: normaliseInvitees(raw),
    transcriptPlaintext: transcript,
    shareUrl: raw.share_url ?? raw.recording_url,
    summary: raw.summary ?? raw.ai_summary,
  };
}

export class FathomApiClient implements IFathomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FathomApiClientOptions) {
    if (!opts.apiKey) {
      throw new Error("FathomApiClient: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? FATHOM_API_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async getRecording(recordingId: string): Promise<FathomRecording> {
    const url = `${this.baseUrl}/recordings/${encodeURIComponent(recordingId)}`;
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await safeReadText(res);
      log.warn("fathom api non-2xx", {
        recording_id: recordingId,
        status: res.status,
        body_excerpt: text.slice(0, 200),
      });
      throw new Error(
        `fathom getRecording ${recordingId}: ${res.status} ${text.slice(0, 120)}`,
      );
    }
    const raw = (await res.json()) as RawRecording | { recording?: RawRecording };
    const rec =
      "recording" in raw && raw.recording != null ? raw.recording : (raw as RawRecording);
    return normaliseRecording(rec);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
