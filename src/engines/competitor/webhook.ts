/**
 * Apify webhook payload parsing + token verification.
 *
 * Apify's ad-hoc webhook delivers its default payload shape:
 *   {
 *     eventType: "ACTOR.RUN.SUCCEEDED" | "ACTOR.RUN.FAILED" | ...,
 *     resource: { id, defaultDatasetId, status, ... },
 *     ...
 *   }
 *
 * We carry our own correlation IDs (competitor_id, user_id) as URL
 * query parameters on the webhook URL — see buildReelScraperInput.
 * Earlier we tried to inject them via Apify's `payloadTemplate` field,
 * but the {{ }} placeholders came through as literal strings on
 * delivery, so we abandoned that approach and put the IDs in the URL
 * where they round-trip cleanly.
 *
 * Token auth: Apify lets us set a static secret in the webhook's
 * `headersTemplate`. The route does a constant-time compare against
 * APIFY_WEBHOOK_SECRET before reading anything else.
 */

import { timingSafeEqual } from "node:crypto";

export class ApifyWebhookParseError extends Error {}

export interface ApifyWebhookCorrelation {
  competitorId: string;
  userId: string;
}

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

/**
 * Pull our correlation IDs off the request URL. Throws if either is
 * missing so the route can reject the request before touching Inngest.
 */
export function parseWebhookCorrelation(
  searchParams: URLSearchParams,
): ApifyWebhookCorrelation {
  const competitorId = (searchParams.get("competitor_id") ?? "").trim();
  const userId = (searchParams.get("user_id") ?? "").trim();
  if (!competitorId) {
    throw new ApifyWebhookParseError("competitor_id missing from URL");
  }
  if (!userId) {
    throw new ApifyWebhookParseError("user_id missing from URL");
  }
  return { competitorId, userId };
}

/**
 * Defensive parser for Apify's default webhook body. Combines the URL
 * correlation with the body fields into a single normalised payload
 * the worker can act on. Throws if any required field is missing.
 */
export function parseApifyWebhookBody(
  body: string,
  correlation: ApifyWebhookCorrelation,
): ApifyWebhookPayload {
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

  const eventType = required(obj.eventType, "eventType");

  const resource = obj.resource;
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    throw new ApifyWebhookParseError("resource missing or not an object");
  }
  const r = resource as Record<string, unknown>;
  const actorRunId = required(r.id, "resource.id");
  const datasetId = required(r.defaultDatasetId, "resource.defaultDatasetId");

  return {
    competitorId: correlation.competitorId,
    userId: correlation.userId,
    actorRunId,
    datasetId,
    status: eventType,
    succeeded: eventType === "ACTOR.RUN.SUCCEEDED",
  };
}

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApifyWebhookParseError(`${name} missing or not a string`);
  }
  return value;
}
