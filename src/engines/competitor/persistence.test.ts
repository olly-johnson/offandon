import { describe, expect, it, vi } from "vitest";

import {
  addCompetitor,
  COMPETITOR_LIMIT_PER_USER,
  CompetitorLimitError,
  DuplicateCompetitorError,
  InvalidCompetitorHandleError,
  listCompetitors,
  normaliseHandle,
  removeCompetitor,
  type CompetitorSupabaseClient,
} from "./persistence";

const NOW = new Date("2026-05-20T00:00:00.000Z");

function ok<T>(data: T) {
  return Promise.resolve({ data, error: null });
}

describe("normaliseHandle", () => {
  it("strips a leading @ and lowercases", () => {
    expect(normaliseHandle("@Olly")).toBe("olly");
  });

  it("trims surrounding whitespace", () => {
    expect(normaliseHandle("  @olly_j  ")).toBe("olly_j");
  });

  it("rejects empty input", () => {
    expect(() => normaliseHandle("  ")).toThrow(InvalidCompetitorHandleError);
  });

  it("rejects handles with disallowed characters", () => {
    expect(() => normaliseHandle("olly johnson")).toThrow(
      InvalidCompetitorHandleError,
    );
  });

  it("rejects handles longer than the IG max of 30", () => {
    expect(() => normaliseHandle("a".repeat(31))).toThrow(
      InvalidCompetitorHandleError,
    );
  });
});

describe("listCompetitors", () => {
  it("returns rows ordered by added_at asc", async () => {
    const rows = [
      { id: "c1", username: "olly", display_name: null, note: null, added_at: "2026-05-18T00:00:00Z", last_synced_at: null, last_sync_error: null },
    ];
    const order = vi.fn().mockReturnValue(ok(rows));
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    const out = await listCompetitors(supabase, "user-1");
    expect(out).toEqual(rows);
    expect(from).toHaveBeenCalledWith("competitor_accounts");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toHaveBeenCalledWith("added_at", { ascending: true });
  });
});

describe("addCompetitor", () => {
  function buildSupabase(opts: {
    existing: Array<{ username: string }>;
    insertResponse?:
      | { data: { id: string }; error: null }
      | { data: null; error: { code: string; message: string } };
  }) {
    const orderForList = vi
      .fn()
      .mockReturnValue(ok(opts.existing));
    const eqForList = vi.fn().mockReturnValue({ order: orderForList });
    const selectForList = vi.fn().mockReturnValue({ eq: eqForList });

    const single = vi
      .fn()
      .mockResolvedValue(
        opts.insertResponse ?? { data: { id: "new-id" }, error: null },
      );
    const selectAfterInsert = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });

    const from = vi.fn().mockImplementation((table: string) => {
      if (table !== "competitor_accounts") throw new Error("unexpected table");
      return { select: selectForList, insert };
    });
    return {
      supabase: { from } as unknown as CompetitorSupabaseClient,
      insert,
    };
  }

  it("inserts a normalised username + user_id + sync_pending=true when under the cap", async () => {
    const { supabase, insert } = buildSupabase({ existing: [] });
    const result = await addCompetitor(supabase, {
      userId: "user-1",
      rawHandle: "@OllyJ",
      now: NOW,
    });
    expect(result).toEqual({
      id: "new-id",
      username: "ollyj",
      platform: "instagram",
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      username: "ollyj",
      platform: "instagram",
      added_at: NOW.toISOString(),
      sync_pending: true,
    });
  });

  it("throws DuplicateCompetitorError when the handle is already tracked", async () => {
    const { supabase } = buildSupabase({
      existing: [{ username: "ollyj", platform: "instagram" }],
    });
    await expect(
      addCompetitor(supabase, { userId: "user-1", rawHandle: "@OllyJ" }),
    ).rejects.toBeInstanceOf(DuplicateCompetitorError);
  });

  it("throws CompetitorLimitError when the user already tracks the maximum", async () => {
    const existing = Array.from({ length: COMPETITOR_LIMIT_PER_USER }, (_, i) => ({
      username: `acc${i}`,
    }));
    const { supabase, insert } = buildSupabase({ existing });
    await expect(
      addCompetitor(supabase, { userId: "user-1", rawHandle: "newone" }),
    ).rejects.toBeInstanceOf(CompetitorLimitError);
    expect(insert).not.toHaveBeenCalled();
  });

  it("translates a unique-violation race into DuplicateCompetitorError", async () => {
    const { supabase } = buildSupabase({
      existing: [],
      insertResponse: {
        data: null,
        error: { code: "23505", message: "duplicate" },
      },
    });
    await expect(
      addCompetitor(supabase, { userId: "user-1", rawHandle: "ollyj" }),
    ).rejects.toBeInstanceOf(DuplicateCompetitorError);
  });

  it("propagates other insert errors as Error", async () => {
    const { supabase } = buildSupabase({
      existing: [],
      insertResponse: {
        data: null,
        error: { code: "42501", message: "rls" },
      },
    });
    await expect(
      addCompetitor(supabase, { userId: "user-1", rawHandle: "ollyj" }),
    ).rejects.toThrow(/addCompetitor/);
  });

  it("rejects malformed handles before hitting the DB", async () => {
    const { supabase, insert } = buildSupabase({ existing: [] });
    await expect(
      addCompetitor(supabase, { userId: "user-1", rawHandle: "olly johnson" }),
    ).rejects.toBeInstanceOf(InvalidCompetitorHandleError);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("removeCompetitor", () => {
  it("deletes by id scoped to user_id", async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const del = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await removeCompetitor(supabase, { userId: "user-1", id: "comp-1" });

    expect(from).toHaveBeenCalledWith("competitor_accounts");
    expect(eqId).toHaveBeenCalledWith("id", "comp-1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });
});
