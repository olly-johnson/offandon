/**
 * Webhook payload parsing + HMAC verification.
 *
 * Pulled out of the route handler so the parsing/verification rules are
 * unit-testable without an HTTP stack. The HMAC scheme matches what the
 * Apps Script template at examples/google_form_webhook.gs produces:
 *
 *   hex = HMAC-SHA256(secret, raw_body_bytes_utf8)
 *   header: X-Off-On-Signature: sha256=<hex>
 *
 * `verifyHmac` is constant-time and accepts the header value with or
 * without the `sha256=` prefix to keep the script side forgiving.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookPayload {
  respondentEmail: string;
  submittedAt: string;
  answers: Record<string, string>;
}

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
  // Tolerate a missing prefix on the wire.
  const provided = headerValue.startsWith(HMAC_PREFIX)
    ? headerValue
    : HMAC_PREFIX + headerValue;
  const b = Buffer.from(provided, "utf8");

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class WebhookParseError extends Error {}

/**
 * Defensive parser. Apps Script can be edited by an operator at any
 * time, so we don't trust the shape; missing fields throw rather than
 * silently inserting empty rows.
 */
export function parseWebhookBody(body: string): WebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new WebhookParseError(
      `invalid JSON: ${(e as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new WebhookParseError("body is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const respondentEmail = obj.respondentEmail;
  if (typeof respondentEmail !== "string" || !respondentEmail.includes("@")) {
    throw new WebhookParseError("respondentEmail missing or invalid");
  }

  const submittedAt = obj.submittedAt;
  if (typeof submittedAt !== "string" || Number.isNaN(Date.parse(submittedAt))) {
    throw new WebhookParseError("submittedAt missing or unparseable");
  }

  const answers = obj.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    throw new WebhookParseError("answers missing or not an object");
  }
  const cleanAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
    cleanAnswers[k] = typeof v === "string" ? v : v == null ? "" : String(v);
  }

  return {
    respondentEmail: respondentEmail.toLowerCase().trim(),
    submittedAt,
    answers: cleanAnswers,
  };
}
