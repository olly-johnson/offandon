import type { NextRequest } from "next/server";

import { enrolInOnboarding } from "@/engines/payments/enrol";
import {
  FANBASIS_SIGNATURE_HEADER,
  FanbasisParseError,
  parseFanbasisPayment,
  verifyFanbasisSignature,
} from "@/engines/payments";
import { createLogger } from "@/lib/shared/logger";

const log = createLogger("api.payments.fanbasis");

/**
 * Fanbasis payment webhook -> GHL onboarding (BO-080).
 *
 * Verifies the x-webhook-signature HMAC, parses payment.succeeded, and
 * enrols the buyer into GHL onboarding (upsert contact + tag). Other
 * Fanbasis event types are acknowledged with 200 and ignored.
 *
 *   200 ok=true                 enrolled
 *   200 ok=true ignored=true    non-payment event; nothing to do
 *   400                         body unparseable
 *   401                         bad or missing signature
 *   500                         env misconfigured / GHL call failed (Fanbasis retries)
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.FANBASIS_WEBHOOK_SECRET;
  if (!secret) {
    log.error("FANBASIS_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(FANBASIS_SIGNATURE_HEADER);
  if (!verifyFanbasisSignature(secret, rawBody, signature)) {
    log.warn("fanbasis signature mismatch", { had_header: signature != null });
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let event;
  try {
    event = parseFanbasisPayment(rawBody);
  } catch (err) {
    const msg = err instanceof FanbasisParseError ? err.message : (err as Error).message;
    log.warn("fanbasis payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  if (!event) {
    log.info("fanbasis event ignored (not a flat successful payment)");
    return Response.json({ ok: true, ignored: true });
  }

  try {
    await enrolInOnboarding(event);
  } catch (err) {
    log.error("fanbasis enrol failed", {
      external_id: event.externalId,
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ ok: false, error: "enrol failed" }, { status: 500 });
  }

  return Response.json({ ok: true, ignored: false });
}
