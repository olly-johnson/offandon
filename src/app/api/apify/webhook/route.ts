import type { NextRequest } from "next/server";

import {
  ApifyWebhookParseError,
  parseApifyWebhookBody,
  parseWebhookCorrelation,
  verifyApifyWebhookToken,
} from "@/engines/competitor/webhook";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";

const log = createLogger("api.apify.webhook");

const TOKEN_HEADER = "x-apify-webhook-token";

/**
 * Receives Apify actor-run completion webhooks.
 *
 * Wire shape: the actor is started by competitor-scrape-requested with
 * an ad-hoc webhook whose `requestUrl` includes our correlation IDs as
 * query parameters (?competitor_id=...&user_id=...). Apify POSTs its
 * default payload to that URL; we verify the shared secret in
 * X-Apify-Webhook-Token, pull the IDs off the URL, parse the body, and
 * emit competitor/scrape.completed for the Inngest ingest function.
 *
 * Outcomes:
 *   200 ok=true     event emitted
 *   400             body unparseable / correlation missing
 *   401             bad or missing token
 *   500             environment misconfigured
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    log.error("APIFY_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const token = request.headers.get(TOKEN_HEADER);
  if (!verifyApifyWebhookToken(secret, token)) {
    log.warn("apify webhook token mismatch", { had_header: token != null });
    return Response.json({ ok: false, error: "bad token" }, { status: 401 });
  }

  let correlation;
  try {
    correlation = parseWebhookCorrelation(request.nextUrl.searchParams);
  } catch (err) {
    const msg =
      err instanceof ApifyWebhookParseError ? err.message : (err as Error).message;
    log.warn("apify webhook correlation parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const rawBody = await request.text();
  let payload;
  try {
    payload = parseApifyWebhookBody(rawBody, correlation);
  } catch (err) {
    const msg =
      err instanceof ApifyWebhookParseError ? err.message : (err as Error).message;
    log.warn("apify webhook body parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  await inngest.send({
    name: INNGEST_EVENTS.CompetitorScrapeCompleted,
    data: {
      competitor_id: payload.competitorId,
      user_id: payload.userId,
      actor_run_id: payload.actorRunId,
      dataset_id: payload.datasetId,
      succeeded: payload.succeeded,
      status: payload.status,
    },
  });

  log.info("apify webhook accepted", {
    competitor_id: payload.competitorId,
    user_id: payload.userId,
    actor_run_id: payload.actorRunId,
    succeeded: payload.succeeded,
  });

  return Response.json({ ok: true });
}
