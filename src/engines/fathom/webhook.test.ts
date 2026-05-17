import { describe, expect, it } from "vitest";

import {
  parseWebhookBody,
  pickClientInvitee,
  signBody,
  verifyHmac,
  WebhookParseError,
} from "./webhook";

const SECRET = "fathom-test-secret";

describe("signBody / verifyHmac", () => {
  it("round-trips with sha256= prefix", () => {
    const body = JSON.stringify({ id: "abc" });
    const sig = signBody(SECRET, body);
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(verifyHmac(SECRET, body, sig)).toBe(true);
  });

  it("accepts the digest with no prefix", () => {
    const body = JSON.stringify({ id: "abc" });
    const sig = signBody(SECRET, body).slice("sha256=".length);
    expect(verifyHmac(SECRET, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ id: "abc" });
    const sig = signBody(SECRET, body);
    expect(verifyHmac(SECRET, body + "x", sig)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const body = JSON.stringify({ id: "abc" });
    const sig = signBody("other", body);
    expect(verifyHmac(SECRET, body, sig)).toBe(false);
  });

  it("rejects missing signature", () => {
    expect(verifyHmac(SECRET, "x", null)).toBe(false);
  });
});

describe("parseWebhookBody", () => {
  const goodBody = () =>
    JSON.stringify({
      id: "rec_123",
      title: "Coaching call with Alice",
      started_at: "2026-05-17T15:00:00Z",
      invitees: [
        { email: "OLLY@example.com", name: "Olly" },
        { email: "alice@client.com", name: "Alice" },
      ],
      transcript_plaintext: "Olly: hello\nAlice: hi",
      share_url: "https://fathom.video/calls/rec_123",
    });

  it("parses the canonical payload shape", () => {
    const out = parseWebhookBody(goodBody());
    expect(out.recordingId).toBe("rec_123");
    expect(out.title).toBe("Coaching call with Alice");
    expect(out.startedAt).toBe("2026-05-17T15:00:00Z");
    expect(out.invitees.map((i) => i.email)).toEqual([
      "olly@example.com",
      "alice@client.com",
    ]);
    expect(out.transcriptPlaintext).toBe("Olly: hello\nAlice: hi");
    expect(out.shareUrl).toBe("https://fathom.video/calls/rec_123");
  });

  it("flattens a nested 'recording' wrapper", () => {
    const body = JSON.stringify({
      recording: {
        recording_id: "rec_999",
        meeting_title: "Strategy",
        scheduled_start_time: "2026-05-17T10:00:00Z",
        attendees: [{ email: "a@example.com" }],
      },
    });
    const out = parseWebhookBody(body);
    expect(out.recordingId).toBe("rec_999");
    expect(out.title).toBe("Strategy");
    expect(out.invitees).toHaveLength(1);
    expect(out.transcriptPlaintext).toBeUndefined();
  });

  it("defaults title when none provided", () => {
    const body = JSON.stringify({
      id: "x",
      started_at: "2026-05-17T10:00:00Z",
      invitees: [{ email: "a@example.com" }],
    });
    const out = parseWebhookBody(body);
    expect(out.title).toBe("Untitled call");
  });

  it("throws when recording id is missing", () => {
    const body = JSON.stringify({
      started_at: "2026-05-17T10:00:00Z",
      invitees: [{ email: "a@x.com" }],
    });
    expect(() => parseWebhookBody(body)).toThrow(/recordingId/);
  });

  it("throws when started_at is unparseable", () => {
    const body = JSON.stringify({
      id: "x",
      started_at: "yesterday",
      invitees: [{ email: "a@x.com" }],
    });
    expect(() => parseWebhookBody(body)).toThrow(/startedAt/);
  });

  it("throws when invitee list is empty", () => {
    const body = JSON.stringify({
      id: "x",
      started_at: "2026-05-17T10:00:00Z",
      invitees: [],
    });
    expect(() => parseWebhookBody(body)).toThrow(/invitees/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseWebhookBody("nope")).toThrow(WebhookParseError);
  });
});

describe("pickClientInvitee", () => {
  it("returns the first non-operator invitee", () => {
    const out = pickClientInvitee(
      [
        { email: "olly@example.com" },
        { email: "alice@client.com" },
        { email: "bob@client.com" },
      ],
      ["olly@example.com"],
    );
    expect(out?.email).toBe("alice@client.com");
  });

  it("is case insensitive on the operator list", () => {
    const out = pickClientInvitee(
      [{ email: "olly@example.com" }, { email: "alice@client.com" }],
      [" OLLY@example.com "],
    );
    expect(out?.email).toBe("alice@client.com");
  });

  it("returns null when only operators are present", () => {
    const out = pickClientInvitee(
      [{ email: "olly@example.com" }],
      ["olly@example.com"],
    );
    expect(out).toBeNull();
  });
});
