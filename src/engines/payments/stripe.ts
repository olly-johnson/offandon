/**
 * Stripe payment webhook: signature verification + parsing (BO-080).
 *
 * Verifies Stripe's `stripe-signature` header without pulling in the
 * Stripe SDK (consistent with the repo's no-SDK pattern). The header is
 *   t=<unix>,v1=<hex>[,v1=<hex>...]
 * and the signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the
 * endpoint's whsec_ secret. We accept the event if any v1 matches and the
 * timestamp is within tolerance (replay guard).
 *
 * Only `checkout.session.completed` (what Payment Links fire) is acted on;
 * other events parse to null so the route 200-and-ignores them.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentEvent } from "./types";

export const STRIPE_SIGNATURE_HEADER = "stripe-signature";
const DEFAULT_TOLERANCE_S = 300;

export class StripeParseError extends Error {}

function parseSigHeader(header: string): { t: number | null; v1: string[] } {
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t" && v) t = Number.parseInt(v, 10);
    else if (k === "v1" && v) v1.push(v);
  }
  return { t, v1 };
}

export function verifyStripeSignature(args: {
  secret: string;
  rawBody: string;
  header: string | null;
  /** Override for tests; defaults to wall clock. */
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  if (!args.header) return false;
  const { t, v1 } = parseSigHeader(args.header);
  if (t === null || Number.isNaN(t) || v1.length === 0) return false;

  const now = Math.floor((args.nowMs ?? Date.now()) / 1000);
  const tolerance = args.toleranceSeconds ?? DEFAULT_TOLERANCE_S;
  if (Math.abs(now - t) > tolerance) return false;

  const expected = createHmac("sha256", args.secret)
    .update(`${t}.${args.rawBody}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  return v1.some((sig) => {
    const b = Buffer.from(sig, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/**
 * Parse a Stripe webhook body. Returns a PaymentEvent for a completed
 * checkout, or null for any other event type.
 */
export function parseStripeCheckout(rawBody: string): PaymentEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    throw new StripeParseError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new StripeParseError("body is not an object");
  }
  const event = parsed as Record<string, unknown>;

  if (event.type !== "checkout.session.completed") return null;

  const session = ((event.data as Record<string, unknown> | undefined)?.object ??
    {}) as Record<string, unknown>;
  const details = (session.customer_details ?? {}) as Record<string, unknown>;

  const email =
    (typeof details.email === "string" ? details.email : undefined) ??
    (typeof session.customer_email === "string" ? session.customer_email : undefined);
  if (!email || !email.includes("@")) {
    throw new StripeParseError("customer email missing on checkout session");
  }

  const sessionId = typeof session.id === "string" ? session.id : null;
  const eventId = typeof event.id === "string" ? event.id : null;
  const externalId = sessionId ?? eventId;
  if (!externalId) {
    throw new StripeParseError("no session id / event id");
  }

  return {
    provider: "stripe",
    email: email.toLowerCase().trim(),
    name: typeof details.name === "string" ? details.name : null,
    amountCents:
      typeof session.amount_total === "number" ? session.amount_total : null,
    currency:
      typeof session.currency === "string"
        ? session.currency.toUpperCase()
        : null,
    externalId,
  };
}
