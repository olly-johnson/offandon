import { describe, expect, it, vi } from "vitest";

import { collectAttendeeEmails, resolveAttendees } from "./mapping";
import type { FathomRecording } from "./types";

function makeRecording(overrides: Partial<FathomRecording> = {}): FathomRecording {
  return {
    recordingId: "rec_1",
    title: "Call",
    startedAt: "2026-05-17T10:00:00Z",
    invitees: [],
    transcript: [],
    transcriptPlaintext: "",
    ...overrides,
  };
}

describe("collectAttendeeEmails", () => {
  it("merges invitees + recorded_by, lowercased and deduplicated", () => {
    const rec = makeRecording({
      invitees: [
        { email: "ALEX@example.com" },
        { email: "alice@client.com" },
        { email: "alex@example.com" },
      ],
      recordedByEmail: "Alex@example.com",
    });
    expect(collectAttendeeEmails(rec)).toEqual([
      "alex@example.com",
      "alice@client.com",
    ]);
  });

  it("returns empty when no attendees + no recorder", () => {
    expect(collectAttendeeEmails(makeRecording())).toEqual([]);
  });
});

describe("resolveAttendees", () => {
  function makeSupabase(aliases: Array<{ user_id: string; fathom_email: string }>) {
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn(async (_col: string, values: string[]) => ({
          data: aliases.filter((a) => values.includes(a.fathom_email)),
          error: null,
        })),
      })),
    }));
    return { from: fromMock } as unknown as Parameters<typeof resolveAttendees>[0];
  }

  it("matches an invitee directly via auth.users.email", async () => {
    const supabase = makeSupabase([]);
    const out = await resolveAttendees(
      supabase,
      new Map([["alex@example.com", "user-a"]]),
      makeRecording({ invitees: [{ email: "alex@example.com" }] }),
    );
    expect(out.matched).toEqual([{ email: "alex@example.com", userId: "user-a" }]);
    expect(out.unmatchedEmails).toEqual([]);
  });

  it("falls back to the alias table when auth.users doesn't have the email", async () => {
    const supabase = makeSupabase([
      { user_id: "user-b", fathom_email: "alice@client.com" },
    ]);
    const out = await resolveAttendees(
      supabase,
      new Map(),
      makeRecording({ invitees: [{ email: "alice@client.com" }] }),
    );
    expect(out.matched).toEqual([{ email: "alice@client.com", userId: "user-b" }]);
    expect(out.unmatchedEmails).toEqual([]);
  });

  it("returns multiple matched users when several attendees resolve", async () => {
    const supabase = makeSupabase([
      { user_id: "user-b", fathom_email: "alice@client.com" },
    ]);
    const out = await resolveAttendees(
      supabase,
      new Map([["alex@example.com", "user-a"]]),
      makeRecording({
        invitees: [
          { email: "alex@example.com" },
          { email: "alice@client.com" },
          { email: "stranger@elsewhere.com" },
        ],
      }),
    );
    expect(out.matched.map((m) => m.email).sort()).toEqual([
      "alex@example.com",
      "alice@client.com",
    ]);
    expect(out.unmatchedEmails).toEqual(["stranger@elsewhere.com"]);
  });

  it("prefers the direct auth.users match and doesn't double-lookup", async () => {
    const aliasIn = vi.fn(async () => ({ data: [], error: null }));
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ in: aliasIn })),
      })),
    } as unknown as Parameters<typeof resolveAttendees>[0];
    await resolveAttendees(
      supabase,
      new Map([["alex@example.com", "user-a"]]),
      makeRecording({ invitees: [{ email: "alex@example.com" }] }),
    );
    expect(aliasIn).not.toHaveBeenCalled();
  });

  it("returns empty when the recording has no attendees", async () => {
    const out = await resolveAttendees(makeSupabase([]), new Map(), makeRecording());
    expect(out.matched).toEqual([]);
    expect(out.unmatchedEmails).toEqual([]);
  });
});
