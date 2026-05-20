/**
 * Apify webhook payload parsing + token verification.
 *
 * We don't use HMAC because Apify lets us inject a static secret into
 * the webhook request headers via the actor's `webhooks[].headersTemplate`
 * field; that's the standard pattern for Apify integrations. The route
 * does a constant-time string compare against APIFY_WEBHOOK_SECRET.
 *
 * The payload we receive is whatever we templated in
 * buildReelScraperInput (not Apify's default envelope), so the parser
 * matches that exact shape.
 */

import { timingSafeEqual } from "node:crypto";

export class ApifyWebhookParseError extends Error {}

export interface ApifyWebhookPayload {
  competitorId: string;
  userId: string;
  actorRunId: string;
  datasetId: string;
  status: string;
  /** True when the run finished cleanly. False for failure / abort / timeout. */
  succeeded: boolean;
}

export function verifyApifyWebhookToken(
  secret: string,
  headerValue: string | null,
): boolean {
  if (!secret || !headerValue) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseApifyWebhookBody(body: string): ApifyWebhookPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    throw new ApifyWebhookParseError(
      `invalid JSON: ${(e as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ApifyWebhookParseError("body is not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const competitorId = required(obj.competitor_id, "competitor_id");
  const userId = required(obj.user_id, "user_id");
  const actorRunId = required(obj.actorRunId, "actorRunId");
  const datasetId = required(obj.datasetId, "datasetId");
  const status = required(obj.status, "status");

  return {
    competitorId,
    userId,
    actorRunId,
    datasetId,
    status,
    succeeded: status === "ACTOR.RUN.SUCCEEDED",
  };
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApifyWebhookParseError(`${name} missing or not a string`);
  }
  return value;
}
