/**
 * GoHighLevel ("Hookd") weekly check-in webhook: payload parsing + shared
 * secret verification.
 *
 * GHL's *Survey Submitted* workflow (survey "Off&On Weekly Check-In") adds
 * a Webhook action that POSTs to /api/ghl/webhook. Unlike the Google Form
 * Apps Script (which HMAC-signs the body), a GHL workflow webhook can only
 * attach a static custom header, so we authenticate with a constant-time
 * compare of a shared secret rather than an HMAC.
 *
 * We control the payload via GHL's custom-data mapping, but operators edit
 * that mapping by hand, so the parser is deliberately tolerant about
 * shape: it accepts either
 *
 *   flat:   { email, submitted_at?, "<question>": "<answer>", ... }
 *   nested: { email, submittedAt?, answers: { "<question>": "<answer>" } }
 *
 * `email` is the only hard requirement (it's how the route resolves the
 * Bot OS user). Everything that isn't a recognised control key becomes an
 * answer. submittedAt is optional; the route fills `now` when it's absent.
 */

import { timingSafeEqual } from "node:crypto";

/** Top-level keys that are control fields, never folded into answers. */
const CONTROL_KEYS = new Set([
  "email",
  "contact_email",
  "respondentEmail",
  "submitted_at",
  "submittedAt",
  "answers",
]);

export interface GhlCheckinPayload {
  /** Lowercased, trimmed. Always contains "@" (validated). */
  email: string;
  /** ISO string when GHL supplied one, else null (route defaults to now). */
  submittedAt: string | null;
  /** Question label -> stringified answer. Never empty. */
  answers: Record<string, string>;
}

export class GhlCheckinParseError extends Error {}

/**
 * Constant-time shared-secret check for the inbound GHL webhook header.
 * Mirrors the Apify token pattern: returns false (not throw) on any
 * mismatch or missing header so the route can answer a clean 401.
 */
export function verifyGhlWebhookSecret(
  secret: string,
  headerValue: string | null,
): boolean {
  if (!headerValue) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function coerceAnswer(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export function parseGhlCheckinBody(body: string): GhlCheckinPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new GhlCheckinParseError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GhlCheckinParseError("body is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const rawEmail = obj.email ?? obj.contact_email ?? obj.respondentEmail;
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    throw new GhlCheckinParseError("email missing or invalid");
  }
  const email = rawEmail.toLowerCase().trim();

  const rawSubmittedAt = obj.submitted_at ?? obj.submittedAt;
  let submittedAt: string | null = null;
  if (rawSubmittedAt != null) {
    if (
      typeof rawSubmittedAt !== "string" ||
      Number.isNaN(Date.parse(rawSubmittedAt))
    ) {
      throw new GhlCheckinParseError("submitted_at present but unparseable");
    }
    submittedAt = rawSubmittedAt;
  }

  const answers: Record<string, string> = {};
  if (obj.answers != null) {
    if (typeof obj.answers !== "object" || Array.isArray(obj.answers)) {
      throw new GhlCheckinParseError("answers present but not an object");
    }
    for (const [k, v] of Object.entries(obj.answers as Record<string, unknown>)) {
      answers[k] = coerceAnswer(v);
    }
  } else {
    // Flat shape: every non-control key is an answer.
    for (const [k, v] of Object.entries(obj)) {
      if (CONTROL_KEYS.has(k)) continue;
      answers[k] = coerceAnswer(v);
    }
  }

  if (Object.keys(answers).length === 0) {
    throw new GhlCheckinParseError("no answers in payload");
  }

  return { email, submittedAt, answers };
}
