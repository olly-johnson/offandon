import { describe, expect, it } from "vitest";

import {
  flattenTranscript,
  normaliseRecording,
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

describe("flattenTranscript", () => {
  it("merges consecutive turns by the same speaker", () => {
    const out = flattenTranscript([
      { speaker: "Olly", speakerEmail: null, text: "Hello.", timestamp: "00:00" },
      { speaker: "Olly", speakerEmail: null, text: "How are you?", timestamp: "00:01" },
      { speaker: "Alice", speakerEmail: null, text: "Good.", timestamp: "00:02" },
      { speaker: "Olly", speakerEmail: null, text: "Great.", timestamp: "00:03" },
    ]);
    expect(out).toBe("Olly: Hello. How are you?\nAlice: Good.\nOlly: Great.");
  });

  it("skips blank turns", () => {
    const out = flattenTranscript([
      { speaker: "A", speakerEmail: null, text: " ", timestamp: "00:00" },
      { speaker: "A", speakerEmail: null, text: "Hi", timestamp: "00:01" },
    ]);
    expect(out).toBe("A: Hi");
  });

  it("returns empty string for empty input", () => {
    expect(flattenTranscript([])).toBe("");
  });
});

describe("normaliseRecording", () => {
  const fathomShape = () => ({
    title: "Coaching call",
    meeting_title: "Coaching call",
    url: "https://fathom.video/calls/675323934",
    recording_id: 675323934,
    recording_start_time: "2026-05-15T10:00:00Z",
    recording_end_time: "2026-05-15T10:55:00Z",
    duration_seconds: 3300,
    calendar_invitees: [
      {
        name: "Alex Shaw",
        email: "alexshaw1312@gmail.com",
        email_domain: "gmail.com",
        is_external: false,
      },
      {
        name: "Will Ross",
        email: "will@client.com",
        email_domain: "client.com",
        is_external: true,
      },
    ],
    recorded_by: {
      name: "Alex Shaw",
      email: "alexshaw1312@gmail.com",
      email_domain: "gmail.com",
    },
    transcript: [
      {
        speaker: {
          display_name: "Alex Shaw",
          matched_calendar_invitee_email: "alexshaw1312@gmail.com",
        },
        text: "Welcome in.",
        timestamp: "00:00:00",
      },
      {
        speaker: {
          display_name: "Alex Shaw",
          matched_calendar_invitee_email: "alexshaw1312@gmail.com",
        },
        text: "How are you?",
        timestamp: "00:00:02",
      },
      {
        speaker: {
          display_name: "Will Ross",
          matched_calendar_invitee_email: null,
        },
        text: "Good thanks.",
        timestamp: "00:00:04",
      },
    ],
    share_url: "https://fathom.video/share/abc",
    default_summary: null,
  });

  it("normalises a canonical Fathom payload", () => {
    const rec = normaliseRecording(fathomShape());
    expect(rec.recordingId).toBe("675323934");
    expect(rec.title).toBe("Coaching call");
    expect(rec.startedAt).toBe("2026-05-15T10:00:00Z");
    expect(rec.durationSeconds).toBe(3300);
    expect(rec.invitees).toHaveLength(2);
    expect(rec.invitees[0]).toMatchObject({
      email: "alexshaw1312@gmail.com",
      name: "Alex Shaw",
      isExternal: false,
    });
    expect(rec.invitees[1].isExternal).toBe(true);
    expect(rec.recordedByEmail).toBe("alexshaw1312@gmail.com");
    expect(rec.transcript).toHaveLength(3);
    expect(rec.transcriptPlaintext).toBe(
      "Alex Shaw: Welcome in. How are you?\nWill Ross: Good thanks.",
    );
    expect(rec.shareUrl).toBe("https://fathom.video/share/abc");
  });

  it("falls back to transcript_plaintext when transcript array is absent", () => {
    const rec = normaliseRecording({
      ...fathomShape(),
      transcript: undefined,
      transcript_plaintext: "Pre-flattened body.",
    });
    expect(rec.transcript).toEqual([]);
    expect(rec.transcriptPlaintext).toBe("Pre-flattened body.");
  });

  it("flattens nested 'recording' envelopes", () => {
    const out = normaliseRecording({ recording: fathomShape() });
    expect(out.recordingId).toBe("675323934");
  });

  it("throws when recording_id is missing", () => {
    const body = { ...fathomShape(), recording_id: undefined, id: undefined };
    expect(() => normaliseRecording(body)).toThrow(/recording_id/);
  });

  it("throws when started_at is unparseable", () => {
    const body = { ...fathomShape(), recording_start_time: "yesterday" };
    expect(() => normaliseRecording(body)).toThrow(/started_at/);
  });

  it("throws when calendar_invitees is empty", () => {
    const body = { ...fathomShape(), calendar_invitees: [] };
    expect(() => normaliseRecording(body)).toThrow(/calendar_invitees/);
  });
});

describe("parseWebhookBody", () => {
  it("parses a JSON-encoded Fathom payload", () => {
    const body = JSON.stringify({
      recording_id: "rec_42",
      recording_start_time: "2026-05-17T15:00:00Z",
      calendar_invitees: [{ email: "a@x.com" }],
      transcript: [
        {
          speaker: { display_name: "A" },
          text: "hello",
          timestamp: "00:00",
        },
      ],
    });
    const out = parseWebhookBody(body);
    expect(out.recordingId).toBe("rec_42");
    expect(out.transcriptPlaintext).toBe("A: hello");
  });

  it("throws WebhookParseError on invalid JSON", () => {
    expect(() => parseWebhookBody("not-json")).toThrow(WebhookParseError);
  });
});

describe("pickClientInvitee", () => {
  it("prefers an invitee with is_external=true regardless of operator list", () => {
    const out = pickClientInvitee(
      [
        { email: "olly@example.com", isExternal: false },
        { email: "alice@client.com", isExternal: true },
      ],
      [],
    );
    expect(out?.email).toBe("alice@client.com");
  });

  it("falls back to operator-filter when no invitee is marked external", () => {
    const out = pickClientInvitee(
      [
        { email: "olly@example.com" },
        { email: "alice@client.com" },
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

  it("returns null when only operators are present and no externals", () => {
    const out = pickClientInvitee(
      [{ email: "olly@example.com" }],
      ["olly@example.com"],
    );
    expect(out).toBeNull();
  });
});
