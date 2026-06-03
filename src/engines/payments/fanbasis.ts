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
 * Tolerant of shape, because the docs and the test endpoint don't fully
 * agree: a real `payment.succeeded` is FLAT with no top-level `type`
 * (payment_id, buyer, amount, status...), but some deliveries wrap it
 * ({type, data}) or include a `type`. We therefore:
 *   - ignore an explicitly non-payment `type` (dispute.*, refund.*, etc.),
 *   - read the payment fields from `data` when present, else top-level,
 *   - require buyer.email + payment_id, and skip a non-"paid" status.
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

  // A top-level type that isn't a payment event (dispute.created, refund.*,
  // subscription.cancelled, ...) -> ignore. Absent type is fine (flat).
  const type = typeof root.type === "string" ? root.type : null;
  if (type && !type.startsWith("payment")) return null;

  // Payment fields live under `data` when enveloped, else at the top level.
  const data = (
    root.data && typeof root.data === "object" && !Array.isArray(root.data)
      ? root.data
      : root
  ) as Record<string, unknown>;

  // A failed payment carries a non-"paid" status; ignore it.
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  if (status && status !== "paid") return null;

  const buyer = (data.buyer ?? {}) as Record<string, unknown>;
  const rawEmail = buyer.email;
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    throw new FanbasisParseError("buyer.email missing or invalid");
  }

  const paymentId =
    (typeof data.payment_id === "string" && data.payment_id) ||
    (typeof data.id === "string" && data.id) ||
    "";
  if (!paymentId) {
    throw new FanbasisParseError("payment_id missing");
  }

  return {
    provider: "fanbasis",
    email: rawEmail.toLowerCase().trim(),
    name: typeof buyer.name === "string" ? buyer.name : null,
    amountCents: typeof data.amount === "number" ? data.amount : null,
    currency: typeof data.currency === "string" ? data.currency : null,
    externalId: paymentId,
  };
}
