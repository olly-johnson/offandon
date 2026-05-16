import { describe, expect, it } from "vitest";

import {
  parseWebhookBody,
  signBody,
  verifyHmac,
  WebhookParseError,
} from "./webhook";

const SECRET = "shared-test-secret";

describe("signBody / verifyHmac", () => {
  it("round-trips with sha256= prefix", () => {
    const body = JSON.stringify({ hello: "world" });
    const sig = signBody(SECRET, body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyHmac(SECRET, body, sig)).toBe(true);
  });

  it("accepts the digest with no prefix", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signBody(SECRET, body).slice("sha256=".length);
    expect(verifyHmac(SECRET, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signBody(SECRET, body);
    expect(verifyHmac(SECRET, body + "x", sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const body = JSON.stringify({ a: 1 });
    const sig = signBody("other-secret", body);
    expect(verifyHmac(SECRET, body, sig)).toBe(false);
  });

  it("rejects missing signature", () => {
    expect(verifyHmac(SECRET, "x", null)).toBe(false);
  });
});

describe("parseWebhookBody", () => {
  it("parses a well-formed payload", () => {
    const body = JSON.stringify({
      respondentEmail: "USER@example.com",
      submittedAt: "2026-05-15T10:00:00Z",
      answers: { "1. Your name.": "Alice", "11. Wins": "shipped a thing" },
    });
    const out = parseWebhookBody(body);
    expect(out.respondentEmail).toBe("user@example.com");
    expect(out.submittedAt).toBe("2026-05-15T10:00:00Z");
    expect(out.answers["11. Wins"]).toBe("shipped a thing");
  });

  it("coerces non-string answers to strings", () => {
    const body = JSON.stringify({
      respondentEmail: "u@x.com",
      submittedAt: "2026-05-15T10:00:00Z",
      answers: { followers: 1234, opt: null },
    });
    const out = parseWebhookBody(body);
    expect(out.answers.followers).toBe("1234");
    expect(out.answers.opt).toBe("");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseWebhookBody("not-json")).toThrow(WebhookParseError);
  });

  it("throws on missing email", () => {
    const body = JSON.stringify({
      submittedAt: "2026-05-15T10:00:00Z",
      answers: {},
    });
    expect(() => parseWebhookBody(body)).toThrow(/respondentEmail/);
  });

  it("throws on unparseable submittedAt", () => {
    const body = JSON.stringify({
      respondentEmail: "u@x.com",
      submittedAt: "not-a-date",
      answers: {},
    });
    expect(() => parseWebhookBody(body)).toThrow(/submittedAt/);
  });

  it("throws when answers is not an object", () => {
    const body = JSON.stringify({
      respondentEmail: "u@x.com",
      submittedAt: "2026-05-15T10:00:00Z",
      answers: ["a", "b"],
    });
    expect(() => parseWebhookBody(body)).toThrow(/answers/);
  });
});
