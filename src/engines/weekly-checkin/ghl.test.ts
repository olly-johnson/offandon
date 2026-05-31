import { describe, expect, it } from "vitest";

import {
  GhlCheckinParseError,
  parseGhlCheckinBody,
  verifyGhlWebhookSecret,
} from "./ghl";

describe("verifyGhlWebhookSecret", () => {
  it("accepts an exact match", () => {
    expect(verifyGhlWebhookSecret("s3cret-value", "s3cret-value")).toBe(true);
  });

  it("rejects a mismatch", () => {
    expect(verifyGhlWebhookSecret("s3cret-value", "nope")).toBe(false);
  });

  it("rejects a null/missing header", () => {
    expect(verifyGhlWebhookSecret("s3cret-value", null)).toBe(false);
  });

  it("rejects when lengths differ (no short-circuit leak)", () => {
    expect(verifyGhlWebhookSecret("s3cret-value", "s3cret")).toBe(false);
  });
});

describe("parseGhlCheckinBody", () => {
  it("parses the flat shape: email + remaining keys become answers", () => {
    const body = JSON.stringify({
      email: "Client@Example.com",
      submitted_at: "2026-05-31T09:00:00Z",
      "Full Name": "Alex Ben Shaw",
      "4. What content did you post this week?": "3 reels, 1 YT",
      "6F. Revenue": "1200",
    });
    const out = parseGhlCheckinBody(body);
    expect(out.email).toBe("client@example.com"); // lowercased + trimmed
    expect(out.submittedAt).toBe("2026-05-31T09:00:00Z");
    expect(out.answers).toEqual({
      "Full Name": "Alex Ben Shaw",
      "4. What content did you post this week?": "3 reels, 1 YT",
      "6F. Revenue": "1200",
    });
    // control keys are not leaked into answers
    expect(out.answers).not.toHaveProperty("email");
    expect(out.answers).not.toHaveProperty("submitted_at");
  });

  it("parses the nested shape: an explicit answers object", () => {
    const body = JSON.stringify({
      email: "a@b.com",
      submittedAt: "2026-05-31T09:00:00Z",
      answers: { "3. Niche": "fitness coaching", "6B. DMs received": "14" },
    });
    const out = parseGhlCheckinBody(body);
    expect(out.email).toBe("a@b.com");
    expect(out.answers).toEqual({
      "3. Niche": "fitness coaching",
      "6B. DMs received": "14",
    });
  });

  it("coerces non-string answer values to strings", () => {
    const body = JSON.stringify({
      email: "a@b.com",
      answers: { "6A. New followers": 240, "rating": 9, blank: null },
    });
    const out = parseGhlCheckinBody(body);
    expect(out.answers["6A. New followers"]).toBe("240");
    expect(out.answers["rating"]).toBe("9");
    expect(out.answers["blank"]).toBe("");
  });

  it("returns submittedAt null when absent (route fills now)", () => {
    const out = parseGhlCheckinBody(
      JSON.stringify({ email: "a@b.com", answers: { q: "v" } }),
    );
    expect(out.submittedAt).toBeNull();
  });

  it("accepts contact_email / respondentEmail as email aliases", () => {
    expect(
      parseGhlCheckinBody(JSON.stringify({ contact_email: "x@y.com", answers: { q: "v" } }))
        .email,
    ).toBe("x@y.com");
    expect(
      parseGhlCheckinBody(JSON.stringify({ respondentEmail: "x@y.com", answers: { q: "v" } }))
        .email,
    ).toBe("x@y.com");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseGhlCheckinBody("{not json")).toThrow(GhlCheckinParseError);
  });

  it("throws when email is missing or not an email", () => {
    expect(() => parseGhlCheckinBody(JSON.stringify({ answers: { q: "v" } }))).toThrow(
      GhlCheckinParseError,
    );
    expect(() =>
      parseGhlCheckinBody(JSON.stringify({ email: "not-an-email", answers: { q: "v" } })),
    ).toThrow(GhlCheckinParseError);
  });

  it("throws when there are no answers at all", () => {
    expect(() => parseGhlCheckinBody(JSON.stringify({ email: "a@b.com" }))).toThrow(
      GhlCheckinParseError,
    );
  });

  it("throws when submitted_at is present but unparseable", () => {
    expect(() =>
      parseGhlCheckinBody(
        JSON.stringify({ email: "a@b.com", submitted_at: "not-a-date", answers: { q: "v" } }),
      ),
    ).toThrow(GhlCheckinParseError);
  });
});
