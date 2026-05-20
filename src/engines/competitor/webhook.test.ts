import { describe, expect, it } from "vitest";

import {
  parseApifyWebhookBody,
  ApifyWebhookParseError,
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

describe("parseApifyWebhookBody", () => {
  it("parses a well-formed payload", () => {
    const body = JSON.stringify({
      competitor_id: "c1",
      user_id: "u1",
      actorRunId: "run-1",
      datasetId: "ds-1",
      status: "ACTOR.RUN.SUCCEEDED",
    });
    const out = parseApifyWebhookBody(body);
    expect(out).toEqual({
      competitorId: "c1",
      userId: "u1",
      actorRunId: "run-1",
      datasetId: "ds-1",
      status: "ACTOR.RUN.SUCCEEDED",
      succeeded: true,
    });
  });

  it("marks failure statuses as succeeded=false", () => {
    const body = JSON.stringify({
      competitor_id: "c1",
      user_id: "u1",
      actorRunId: "run-1",
      datasetId: "ds-1",
      status: "ACTOR.RUN.FAILED",
    });
    expect(parseApifyWebhookBody(body).succeeded).toBe(false);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseApifyWebhookBody("not-json")).toThrow(
      ApifyWebhookParseError,
    );
  });

  it("throws when competitor_id is missing", () => {
    const body = JSON.stringify({
      user_id: "u1",
      actorRunId: "run-1",
      datasetId: "ds-1",
      status: "ACTOR.RUN.SUCCEEDED",
    });
    expect(() => parseApifyWebhookBody(body)).toThrow(/competitor_id/);
  });

  it("throws when datasetId is missing", () => {
    const body = JSON.stringify({
      competitor_id: "c1",
      user_id: "u1",
      actorRunId: "run-1",
      status: "ACTOR.RUN.SUCCEEDED",
    });
    expect(() => parseApifyWebhookBody(body)).toThrow(/datasetId/);
  });
});
