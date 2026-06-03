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
 * payment, or null for any other event type (route ignores those).
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
  const obj = parsed as Record<string, unknown>;

  const type = typeof obj.type === "string" ? obj.type : "";
  if (type !== "payment.succeeded") return null;

  const buyer = (obj.buyer ?? {}) as Record<string, unknown>;
  const rawEmail = buyer.email;
  if (typeof rawEmail !== "string" || !rawEmail.includes("@")) {
    throw new FanbasisParseError("buyer.email missing or invalid");
  }

  const paymentId = obj.payment_id;
  if (typeof paymentId !== "string" || paymentId.length === 0) {
    throw new FanbasisParseError("payment_id missing");
  }

  return {
    provider: "fanbasis",
    email: rawEmail.toLowerCase().trim(),
    name: typeof buyer.name === "string" ? buyer.name : null,
    amountCents: typeof obj.amount === "number" ? obj.amount : null,
    currency: typeof obj.currency === "string" ? obj.currency : null,
    externalId: paymentId,
  };
}
