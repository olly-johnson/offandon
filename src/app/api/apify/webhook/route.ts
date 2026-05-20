import type { NextRequest } from "next/server";

import {
  ApifyWebhookParseError,
  parseApifyWebhookBody,
  verifyApifyWebhookToken,
} from "@/engines/competitor/webhook";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";

const log = createLogger("api.apify.webhook");

const TOKEN_HEADER = "x-apify-webhook-token";

/**
 * Receives Apify actor-run completion webhooks.
 *
 * Wire shape: the actor is started by competitor-scrape-requested with a
 * `webhooks` field that injects this header + a custom payload template
 * (see buildReelScraperInput). Apify POSTs that exact payload here when
 * the run finishes; we verify the shared secret in
 * X-Apify-Webhook-Token, parse, and emit competitor/scrape.completed for
 * the Inngest ingest function to handle.
 *
 * Outcomes:
 *   200 ok=true     event emitted (or already-noop for non-success status)
 *   400             body unparseable
 *   401             bad or missing token
 *   500             environment misconfigured
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) {
    log.error("APIFY_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const token = request.headers.get(TOKEN_HEADER);
  if (!verifyApifyWebhookToken(secret, token)) {
    log.warn("apify webhook token mismatch", { had_header: token != null });
    return Response.json({ ok: false, error: "bad token" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseApifyWebhookBody(rawBody);
  } catch (err) {
    const msg =
      err instanceof ApifyWebhookParseError ? err.message : (err as Error).message;
    log.warn("apify webhook parse error", { error: msg });
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
