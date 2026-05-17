/**
 * Webhook payload parsing + HMAC verification for Fathom.
 *
 * HMAC scheme (same shape as the weekly-checkin webhook so the verification
 * pattern is shared with operators who already know the convention):
 *
 *   hex = HMAC-SHA256(secret, raw_body_bytes_utf8)
 *   header: X-Fathom-Signature: sha256=<hex>
 *
 * The header value is accepted with or without the `sha256=` prefix to
 * keep us robust to provider tweaks; comparison is constant-time.
 *
 * Field tolerance: Fathom's payload varies across plans + dashboard
 * settings (some include the transcript, some only metadata). We extract
 * a minimal contract from a few well-known field name candidates and
 * leave the rest to the API fetch on the Inngest side.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { FathomInvitee, FathomWebhookPayload } from "./types";

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

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
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
    out.push({ email: email.toLowerCase().trim(), name });
  }
  return out;
}

/**
 * Defensive parser. Throws WebhookParseError when the minimum contract
 * isn't met (no recording id, no invitees, no started_at). Optional
 * fields (transcript, share url) are returned as undefined when missing.
 */
export function parseWebhookBody(body: string): FathomWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new WebhookParseError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new WebhookParseError("body is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  // Fathom nests recording metadata under a top-level "recording" key on
  // some plans; flatten it transparently so callers don't care.
  const rec =
    obj.recording && typeof obj.recording === "object"
      ? (obj.recording as Record<string, unknown>)
      : obj;

  const recordingId = firstString(rec, ["id", "recording_id"]);
  if (!recordingId) {
    throw new WebhookParseError("recordingId missing");
  }

  const title =
    firstString(rec, ["title", "meeting_title", "subject"]) ?? "Untitled call";

  const startedAt = firstString(rec, ["started_at", "start_time", "scheduled_start_time"]);
  if (!startedAt || Number.isNaN(Date.parse(startedAt))) {
    throw new WebhookParseError("startedAt missing or unparseable");
  }

  const invitees = parseInvitees(
    rec.invitees ?? rec.attendees ?? rec.participants ?? [],
  );
  if (invitees.length === 0) {
    throw new WebhookParseError("invitees missing or empty");
  }

  const transcriptPlaintext = firstString(rec, [
    "transcript_plaintext",
    "transcript",
    "transcript_text",
  ]);
  const shareUrl = firstString(rec, ["share_url", "recording_url", "url"]);

  return {
    recordingId,
    title,
    startedAt,
    invitees,
    transcriptPlaintext,
    shareUrl,
  };
}

/**
 * Pick the client attendee from the invitee list. The operator email(s)
 * are excluded; the first remaining invitee is returned. Returns null
 * when nothing remains (operator-only call, or a 1:1 with the operator
 * misconfigured).
 *
 * `operatorEmails` is normalised to lowercase by the caller; do the same
 * here for safety.
 */
export function pickClientInvitee(
  invitees: FathomInvitee[],
  operatorEmails: string[],
): FathomInvitee | null {
  const ops = new Set(operatorEmails.map((e) => e.toLowerCase().trim()));
  for (const inv of invitees) {
    if (!ops.has(inv.email)) return inv;
  }
  return null;
}
