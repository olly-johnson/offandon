/**
 * Webhook payload parsing + HMAC verification for Fathom.
 *
 * HMAC scheme: HMAC-SHA256 over the raw request body. The signature is
 * carried in the X-Fathom-Signature header, optionally prefixed with
 * `sha256=`. Comparison is constant-time.
 *
 * Fathom's webhook payload mirrors its REST list-meeting response: the
 * meeting metadata, a structured `transcript` array of speaker turns,
 * the `calendar_invitees` list, and `recorded_by`. We normalise the
 * payload here so the rest of the engine deals only with FathomRecording.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  FathomInvitee,
  FathomRecording,
  FathomTranscriptTurn,
  FathomWebhookPayload,
} from "./types";

const HMAC_PREFIX = "sha256=";

export function signBody(secret: string, body: string): string {
  return HMAC_PREFIX + createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyHmac(
  secret: string,
  body: string,
  headerValue: string | null,
): boolean {
  if (!headerValue) return false;
  const expected = signBody(secret, body);

  const a = Buffer.from(expected, "utf8");
  const provided = headerValue.startsWith(HMAC_PREFIX)
    ? headerValue
    : HMAC_PREFIX + headerValue;
  const b = Buffer.from(provided, "utf8");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class WebhookParseError extends Error {}

/**
 * Convert a structured transcript into "Display Name: text" lines.
 * Consecutive turns from the same speaker are merged so the result reads
 * like a conversation instead of one line per micro-utterance (Fathom
 * splits very aggressively, sometimes a turn is a single word).
 */
export function flattenTranscript(turns: FathomTranscriptTurn[]): string {
  if (turns.length === 0) return "";
  const lines: string[] = [];
  let currentSpeaker: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentSpeaker !== null && buffer.length > 0) {
      lines.push(`${currentSpeaker}: ${buffer.join(" ")}`);
    }
  };

  for (const turn of turns) {
    const text = turn.text.trim();
    if (!text) continue;
    if (turn.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = turn.speaker;
      buffer = [text];
    } else {
      buffer.push(text);
    }
  }
  flush();

  return lines.join("\n");
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = asString(obj[k]);
    if (v) return v;
  }
  return undefined;
}

function parseInvitees(raw: unknown): FathomInvitee[] {
  if (!Array.isArray(raw)) return [];
  const out: FathomInvitee[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const email = firstString(e, ["email", "email_address"]);
    if (!email) continue;
    const name = firstString(e, ["name", "display_name", "full_name"]) ?? null;
    const isExternal =
      typeof e.is_external === "boolean" ? e.is_external : undefined;
    out.push({ email: email.toLowerCase().trim(), name, isExternal });
  }
  return out;
}

function parseTurn(raw: unknown): FathomTranscriptTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const text = typeof r.text === "string" ? r.text : null;
  if (!text) return null;
  const speakerObj =
    r.speaker && typeof r.speaker === "object"
      ? (r.speaker as Record<string, unknown>)
      : null;
  const speakerName = speakerObj
    ? (firstString(speakerObj, ["display_name", "name"]) ?? "Unknown")
    : "Unknown";
  const speakerEmail = speakerObj
    ? (firstString(speakerObj, ["matched_calendar_invitee_email", "email"]) ?? null)
    : null;
  const timestamp = typeof r.timestamp === "string" ? r.timestamp : "";
  return {
    speaker: speakerName,
    speakerEmail: speakerEmail ? speakerEmail.toLowerCase().trim() : null,
    text,
    timestamp,
  };
}

function parseTranscript(raw: unknown): FathomTranscriptTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: FathomTranscriptTurn[] = [];
  for (const entry of raw) {
    const turn = parseTurn(entry);
    if (turn) out.push(turn);
  }
  return out;
}

/**
 * Normalise a parsed JSON object (from the webhook body OR the list-meetings
 * REST response) into a FathomRecording. Throws WebhookParseError when the
 * minimum contract isn't met.
 */
export function normaliseRecording(input: unknown): FathomRecording {
  if (!input || typeof input !== "object") {
    throw new WebhookParseError("payload is not an object");
  }
  const obj = input as Record<string, unknown>;

  const rec =
    obj.recording && typeof obj.recording === "object"
      ? (obj.recording as Record<string, unknown>)
      : obj.meeting && typeof obj.meeting === "object"
        ? (obj.meeting as Record<string, unknown>)
        : obj;

  const recordingId = firstString(rec, ["recording_id", "id", "meeting_id"]);
  if (!recordingId) throw new WebhookParseError("recording_id missing");

  const title =
    firstString(rec, ["title", "meeting_title", "subject"]) ?? "Untitled call";

  const startedAt = firstString(rec, [
    "recording_start_time",
    "started_at",
    "scheduled_start_time",
    "start_time",
  ]);
  if (!startedAt || Number.isNaN(Date.parse(startedAt))) {
    throw new WebhookParseError("started_at missing or unparseable");
  }

  const invitees = parseInvitees(
    rec.calendar_invitees ?? rec.invitees ?? rec.attendees ?? [],
  );
  if (invitees.length === 0) {
    throw new WebhookParseError("calendar_invitees missing or empty");
  }

  const recordedBy =
    rec.recorded_by && typeof rec.recorded_by === "object"
      ? (rec.recorded_by as Record<string, unknown>)
      : null;
  const recordedByEmail = recordedBy
    ? (firstString(recordedBy, ["email"]) ?? null)?.toLowerCase().trim() ?? null
    : null;

  const transcript = parseTranscript(rec.transcript);
  const transcriptPlaintext =
    typeof rec.transcript_plaintext === "string" && rec.transcript_plaintext.length > 0
      ? rec.transcript_plaintext
      : flattenTranscript(transcript);

  const shareUrl =
    firstString(rec, ["share_url", "recording_url", "url"]) ?? undefined;

  const durationRaw =
    typeof rec.duration_seconds === "number"
      ? rec.duration_seconds
      : typeof rec.duration === "number"
        ? rec.duration
        : undefined;

  const summary =
    firstString(rec, ["default_summary", "summary", "ai_summary"]) ?? null;

  return {
    recordingId,
    title,
    startedAt,
    durationSeconds: durationRaw,
    invitees,
    recordedByEmail,
    transcript,
    transcriptPlaintext,
    shareUrl,
    summary,
  };
}

export function parseWebhookBody(body: string): FathomWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new WebhookParseError(`invalid JSON: ${(e as Error).message}`);
  }
  return normaliseRecording(parsed);
}
