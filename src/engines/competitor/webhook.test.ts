import { describe, expect, it } from "vitest";

import {
  parseApifyWebhookBody,
  ApifyWebhookParseError,
  parseWebhookCorrelation,
  verifyApifyWebhookToken,
} from "./webhook";

describe("verifyApifyWebhookToken", () => {
  it("returns true when the header matches the secret", () => {
    expect(verifyApifyWebhookToken("shh", "shh")).toBe(true);
  });

  it("returns false on mismatch", () => {
    expect(verifyApifyWebhookToken("shh", "other")).toBe(false);
  });

  it("returns false on null header", () => {
    expect(verifyApifyWebhookToken("shh", null)).toBe(false);
  });

  it("returns false when the secret is missing", () => {
    expect(verifyApifyWebhookToken("", "shh")).toBe(false);
  });
});

describe("parseWebhookCorrelation", () => {
  it("pulls competitor_id and user_id from search params", () => {
    const params = new URLSearchParams("competitor_id=c1&user_id=u1");
    expect(parseWebhookCorrelation(params)).toEqual({
      competitorId: "c1",
      userId: "u1",
    });
  });

  it("throws when competitor_id is missing", () => {
    const params = new URLSearchParams("user_id=u1");
    expect(() => parseWebhookCorrelation(params)).toThrow(/competitor_id/);
  });

  it("throws when user_id is missing", () => {
    const params = new URLSearchParams("competitor_id=c1");
    expect(() => parseWebhookCorrelation(params)).toThrow(/user_id/);
  });
});

describe("parseApifyWebhookBody", () => {
  const CORRELATION = { competitorId: "c1", userId: "u1" };

  it("parses a successful Apify default payload", () => {
    const body = JSON.stringify({
      eventType: "ACTOR.RUN.SUCCEEDED",
      resource: {
        id: "run-1",
        defaultDatasetId: "ds-1",
        status: "SUCCEEDED",
      },
    });
    expect(parseApifyWebhookBody(body, CORRELATION)).toEqual({
      competitorId: "c1",
      userId: "u1",
      actorRunId: "run-1",
      datasetId: "ds-1",
      status: "ACTOR.RUN.SUCCEEDED",
      succeeded: true,
    });
  });

  it("marks failure event types as succeeded=false", () => {
    const body = JSON.stringify({
      eventType: "ACTOR.RUN.FAILED",
      resource: { id: "run-1", defaultDatasetId: "ds-1" },
    });
    expect(parseApifyWebhookBody(body, CORRELATION).succeeded).toBe(false);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseApifyWebhookBody("not-json", CORRELATION)).toThrow(
      ApifyWebhookParseError,
    );
  });

  it("throws when resource is missing", () => {
    const body = JSON.stringify({ eventType: "ACTOR.RUN.SUCCEEDED" });
    expect(() => parseApifyWebhookBody(body, CORRELATION)).toThrow(/resource/);
  });

  it("throws when resource.defaultDatasetId is missing", () => {
    const body = JSON.stringify({
      eventType: "ACTOR.RUN.SUCCEEDED",
      resource: { id: "run-1" },
    });
    expect(() => parseApifyWebhookBody(body, CORRELATION)).toThrow(
      /defaultDatasetId/,
    );
  });
});
