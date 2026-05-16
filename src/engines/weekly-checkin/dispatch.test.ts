import { describe, expect, it } from "vitest";

import type { IEmailClient, EmailMessage, EmailSendResult } from "@/lib/shared/email";

import { dispatchWeekly } from "./dispatch";
import type { Recipient } from "./types";

class RecordingClient implements IEmailClient {
  sent: EmailMessage[] = [];
  results: EmailSendResult[];
  constructor(results: EmailSendResult[] = []) {
    this.results = results;
  }
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(message);
    return (
      this.results.shift() ?? { ok: true, id: `id-${this.sent.length}` }
    );
  }
}

const RECIPIENTS: Recipient[] = [
  { userId: "u1", email: "a@x.com", displayName: "Alice" },
  { userId: "u2", email: "b@x.com", displayName: null },
];

describe("dispatchWeekly", () => {
  it("sends the send template to each recipient and counts successes", async () => {
    const email = new RecordingClient();
    const result = await dispatchWeekly({
      email,
      recipients: RECIPIENTS,
      formUrl: "https://forms.example/x",
      weekStart: "2026-05-11",
      kind: "send",
    });

    expect(result.attempted).toBe(2);
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(0);
    expect(email.sent).toHaveLength(2);
    expect(email.sent[0].subject).toMatch(/check-in is open/i);
    expect(email.sent[0].to).toBe("a@x.com");
    expect(email.sent[0].text).toContain("Hey Alice");
    expect(email.sent[1].text).toContain("Hey,");
    expect(email.sent[0].idempotencyKey).toBe(
      "weekly-send-2026-05-11-a@x.com",
    );
  });

  it("sends the reminder template when kind=reminder", async () => {
    const email = new RecordingClient();
    await dispatchWeekly({
      email,
      recipients: [RECIPIENTS[0]],
      formUrl: "https://f",
      weekStart: "2026-05-11",
      kind: "reminder",
    });
    expect(email.sent[0].subject).toMatch(/reminder/i);
    expect(email.sent[0].idempotencyKey).toBe(
      "weekly-reminder-2026-05-11-a@x.com",
    );
  });

  it("collects failures rather than throwing", async () => {
    const email = new RecordingClient([
      { ok: true, id: "ok-1" },
      { ok: false, id: null, error: "bounced" },
    ]);
    const result = await dispatchWeekly({
      email,
      recipients: RECIPIENTS,
      formUrl: "https://f",
      weekStart: "2026-05-11",
      kind: "send",
    });
    expect(result.ok).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures[0]).toEqual({ to: "b@x.com", error: "bounced" });
  });
});
