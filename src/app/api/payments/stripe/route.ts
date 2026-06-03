import type { NextRequest } from "next/server";

import { enrolInOnboarding } from "@/engines/payments/enrol";
import {
  parseStripeCheckout,
  STRIPE_SIGNATURE_HEADER,
  StripeParseError,
  verifyStripeSignature,
} from "@/engines/payments";
import { createLogger } from "@/lib/shared/logger";

const log = createLogger("api.payments.stripe");

/**
 * Stripe payment webhook -> GHL onboarding (BO-080).
 *
 * Verifies the stripe-signature header, parses checkout.session.completed,
 * and enrols the buyer into GHL onboarding (upsert contact + tag). Other
 * Stripe event types are acknowledged with 200 and ignored.
 *
 *   200 ok=true                 enrolled
 *   200 ok=true ignored=true    non-checkout event; nothing to do
 *   400                         body unparseable
 *   401                         bad or missing signature
 *   500                         env misconfigured / GHL call failed (Stripe retries)
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    log.error("STRIPE_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(STRIPE_SIGNATURE_HEADER);
  if (!verifyStripeSignature({ secret, rawBody, header: signature })) {
    log.warn("stripe signature mismatch", { had_header: signature != null });
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let event;
  try {
    event = parseStripeCheckout(rawBody);
  } catch (err) {
    const msg = err instanceof StripeParseError ? err.message : (err as Error).message;
    log.warn("stripe payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  if (!event) {
    return Response.json({ ok: true, ignored: true });
  }

  try {
    await enrolInOnboarding(event);
  } catch (err) {
    log.error("stripe enrol failed", {
      external_id: event.externalId,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "enrol failed" }, { status: 500 });
  }

  return Response.json({ ok: true, ignored: false });
}
