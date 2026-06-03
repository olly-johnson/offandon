/**
 * Fanbasis payment webhook: signature verification + parsing (BO-080).
 *
 * Fanbasis fires `payment.succeeded` as flat JSON and signs the raw body
 * with HMAC-SHA256(secret_key), hex-encoded, in the `x-webhook-signature`
 * header. We verify against the raw bytes (never re-serialised JSON) with
 * a constant-time compare.
 *
 * See https://apidocs.fan/ . Only payment.succeeded is acted on; other
 * event types parse to null so the route can 200-and-ignore them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEvent } from "./types";

export const FANBASIS_SIGNATURE_HEADER = "x-webhook-signature";

export class FanbasisParseError extends Error {}

export function verifyFanbasisSignature(
  secret: string,
  rawBody: string,
  headerValue: string | null,
): boolean {
  if (!headerValue) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  // Tolerate an optional "sha256=" prefix some senders add.
  const provided = headerValue.startsWith("sha256=")
    ? headerValue.slice("sha256=".length)
    : headerValue;
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Parse a Fanbasis webhook body. Returns a PaymentEvent for a successful
 * payment, or null for anything we don't act on (route ignores those).
 *
 * Verified against a real delivery (the docs were wrong on three points):
 *   - the event type is in `event_type` (not `type`), e.g. "payment.succeeded";
 *   - a successful payment has status "succeeded" (not "paid");
 *   - the amount is `total_price` (not `amount`), in minor units.
 * Still tolerant of an enveloped `{type, data}` shape just in case.
 */
export function parseFanbasisPayment(rawBody: string): PaymentEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    throw new FanbasisParseError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new FanbasisParseError("body is not an object");
  }
  const root = parsed as Record<string, unknown>;

  // Event type lives in `event_type` (real payloads) or `type` (enveloped).
  const eventType =
    (typeof root.event_type === "string" && root.event_type) ||
    (typeof root.type === "string" && root.type) ||
    null;
  if (eventType && eventType !== "payment.succeeded") return null;

  // Enveloped events nest the fields under `data`; flat events are top-level.
  const data = (
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root
  ) as Record<string, unknown>;

  // Defence in depth: skip a non-success status. Real payloads use
  // "succeeded"; the docs example used "paid". Accept either.
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  if (status && status !== "succeeded" && status !== "paid") return null;

  const buyer = (data.buyer ?? {}) as Record<string, unknown>;
  const rawEmail = buyer.email;
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    throw new FanbasisParseError("buyer.email missing or invalid");
  }

  const idValue = data.payment_id ?? data.id;
  const paymentId = idValue != null ? String(idValue) : "";
  if (!paymentId) {
    throw new FanbasisParseError("payment_id missing");
  }

  const amountCents =
    typeof data.total_price === "number"
      ? data.total_price
      : typeof data.amount === "number"
        ? data.amount
        : null;

  return {
    provider: "fanbasis",
    email: rawEmail.toLowerCase().trim(),
    name: typeof buyer.name === "string" ? buyer.name : null,
    amountCents,
    currency: typeof data.currency === "string" ? data.currency : null,
    externalId: paymentId,
  };
}
