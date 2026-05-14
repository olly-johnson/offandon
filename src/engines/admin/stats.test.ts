import { describe, expect, it, vi } from "vitest";

import {
  computeClientHealth,
  deriveHealth,
  type AdminStats,
  type ClientHealthRow,
} from "./stats";
import type { AdminSupabaseClient } from "./persistence";

describe("deriveHealth", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("returns 'green' when last sign-in is within 7 days", () => {
    expect(deriveHealth("2026-05-13T12:00:00.000Z", now)).toBe("green");
    expect(deriveHealth("2026-05-07T12:00:01.000Z", now)).toBe("green");
  });

  it("returns 'amber' when last sign-in is between 7 and 30 days", () => {
    expect(deriveHealth("2026-05-01T12:00:00.000Z", now)).toBe("amber");
    expect(deriveHealth("2026-04-15T12:00:00.000Z", now)).toBe("amber");
  });

  it("returns 'red' when last sign-in is older than 30 days", () => {
    expect(deriveHealth("2026-03-01T12:00:00.000Z", now)).toBe("red");
  });

  it("returns 'red' when there is no last sign-in", () => {
    expect(deriveHealth(null, now)).toBe("red");
  });
});

/**
 * Build a minimal stub of the service-role Supabase client. Each
 * `from(table)` call hands back a chainable mock whose terminal value
 * is the array (for selects) or count (for `count: exact, head: true`)
 * registered in the dispatch map.
 */
function makeStubClient(dispatch: {
  profiles?: Array<{ id: string; display_name: string | null; created_at: string }>;
  scripts?: Array<{ user_id: string }>;
  conversations?: Array<{ user_id: string }>;
  messages?: Array<{ user_id: string; role: string }>;
  users?: Array<{ id: string; email: string | null; last_sign_in_at: string | null }>;
  totals?: { scripts?: number; conversations?: number; messages?: number; clients?: number };
}): AdminSupabaseClient {
  const tables: Record<string, unknown[]> = {
    profiles: dispatch.profiles ?? [],
    scripts: dispatch.scripts ?? [],
    conversations: dispatch.conversations ?? [],
    messages: dispatch.messages ?? [],
  };
  const counts: Record<string, number> = {
    profiles: dispatch.totals?.clients ?? (dispatch.profiles?.length ?? 0),
    scripts: dispatch.totals?.scripts ?? (dispatch.scripts?.length ?? 0),
    conversations: dispatch.totals?.conversations ?? (dispatch.conversations?.length ?? 0),
    messages: dispatch.totals?.messages ?? (dispatch.messages?.length ?? 0),
  };

  const from = vi.fn().mockImplementation((table: string) => {
    return {
      select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return Promise.resolve({ count: counts[table] ?? 0, error: null });
        }
        return Promise.resolve({ data: tables[table] ?? [], error: null });
      }),
    };
  });

  const listUsers = vi
    .fn()
    .mockResolvedValue({
      data: { users: dispatch.users ?? [] },
      error: null,
    });

  return {
    from,
    auth: { admin: { listUsers } },
  } as unknown as AdminSupabaseClient;
}

describe("computeClientHealth (data layer)", () => {
  const now = new Date("2026-05-14T12:00:00.000Z");

  it("joins profiles + auth.users + counts and returns one row per client", async () => {
    const client = makeStubClient({
      profiles: [
        { id: "u-1", display_name: "Alex", created_at: "2026-04-01T00:00:00Z" },
        { id: "u-2", display_name: null, created_at: "2026-05-01T00:00:00Z" },
      ],
      scripts: [
        { user_id: "u-1" },
        { user_id: "u-1" },
        { user_id: "u-2" },
      ],
      conversations: [{ user_id: "u-1" }],
      messages: [
        { user_id: "u-1", role: "user" },
        { user_id: "u-1", role: "assistant" },
      ],
      users: [
        { id: "u-1", email: "alex@x.com", last_sign_in_at: "2026-05-13T00:00:00Z" },
        { id: "u-2", email: "sam@x.com", last_sign_in_at: null },
      ],
    });

    const rows = await computeClientHealth(client, { now });

    expect(rows).toHaveLength(2);
    const alex = rows.find((r) => r.id === "u-1") as ClientHealthRow;
    expect(alex.name).toBe("Alex");
    expect(alex.email).toBe("alex@x.com");
    expect(alex.scripts).toBe(2);
    expect(alex.chats).toBe(1);
    expect(alex.messages).toBe(2);
    expect(alex.health).toBe("green");
    expect(alex.last_sign_in_at).toBe("2026-05-13T00:00:00Z");

    const sam = rows.find((r) => r.id === "u-2") as ClientHealthRow;
    expect(sam.name).toBe("sam@x.com");
    expect(sam.scripts).toBe(1);
    expect(sam.chats).toBe(0);
    expect(sam.messages).toBe(0);
    expect(sam.health).toBe("red");
  });

  it("sorts rows by health (red first) then by last_sign_in_at desc", async () => {
    const client = makeStubClient({
      profiles: [
        { id: "u-green", display_name: "Green", created_at: "2026-04-01T00:00:00Z" },
        { id: "u-red", display_name: "Red", created_at: "2026-04-01T00:00:00Z" },
        { id: "u-amber", display_name: "Amber", created_at: "2026-04-01T00:00:00Z" },
      ],
      users: [
        { id: "u-green", email: "g@x.com", last_sign_in_at: "2026-05-13T00:00:00Z" },
        { id: "u-red", email: "r@x.com", last_sign_in_at: null },
        { id: "u-amber", email: "a@x.com", last_sign_in_at: "2026-04-20T00:00:00Z" },
      ],
    });

    const rows = await computeClientHealth(client, { now });

    expect(rows.map((r) => r.id)).toEqual(["u-red", "u-amber", "u-green"]);
  });

  it("falls back to email then 'Unknown' for the display name", async () => {
    const client = makeStubClient({
      profiles: [
        { id: "u-1", display_name: null, created_at: "2026-04-01T00:00:00Z" },
        { id: "u-2", display_name: "  ", created_at: "2026-04-01T00:00:00Z" },
      ],
      users: [
        { id: "u-1", email: "only@x.com", last_sign_in_at: null },
        { id: "u-2", email: null, last_sign_in_at: null },
      ],
    });

    const rows = await computeClientHealth(client, { now });
    expect(rows.find((r) => r.id === "u-1")?.name).toBe("only@x.com");
    expect(rows.find((r) => r.id === "u-2")?.name).toBe("Unknown");
  });
});

describe("computeAdminStats (totals)", () => {
  it("exposes total counts for the cards", async () => {
    const { computeAdminStats } = await import("./stats");
    const client = makeStubClient({
      totals: { clients: 9, scripts: 142, conversations: 31, messages: 240 },
    });

    const stats: AdminStats = await computeAdminStats(client);
    expect(stats.total_clients).toBe(9);
    expect(stats.total_scripts).toBe(142);
    expect(stats.total_chats).toBe(31);
    expect(stats.total_messages).toBe(240);
  });
});
