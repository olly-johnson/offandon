import { describe, expect, it, vi } from "vitest";

import type { CheckinSupabase } from "./persistence";
import {
  getLatestCheckinForUser,
  getWeekSubmitters,
  saveCheckin,
} from "./persistence";

/**
 * Hand-rolled fluent stub of the supabase-js builder shape. Only covers
 * the chains saveCheckin / getWeekSubmitters actually use.
 */
function buildInsertStub(opts: {
  error?: { code: string; message: string };
  data?: { id: string; user_id: string; week_start: string; raw_responses: unknown; submitted_at: string };
}): CheckinSupabase {
  const single = vi.fn(async () => ({
    data: opts.data ?? null,
    error: opts.error ?? null,
  }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from } as unknown as CheckinSupabase;
}

function buildSelectStub(rows: Array<{ user_id: string }>): CheckinSupabase {
  const eq = vi.fn(async () => ({ data: rows, error: null }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as CheckinSupabase;
}

describe("saveCheckin", () => {
  it("returns the inserted row on success", async () => {
    const stub = buildInsertStub({
      data: {
        id: "row-1",
        user_id: "user-1",
        week_start: "2026-05-11",
        raw_responses: { a: "b" },
        submitted_at: "2026-05-15T10:00:00.000Z",
      },
    });
    const result = await saveCheckin(stub, {
      userId: "user-1",
      weekStart: "2026-05-11",
      rawResponses: { a: "b" },
      submittedAt: "2026-05-15T10:00:00.000Z",
    });
    expect(result.duplicated).toBe(false);
    expect(result.row?.id).toBe("row-1");
    expect(result.row?.rawResponses).toEqual({ a: "b" });
  });

  it("treats 23505 unique-violation as duplicated, not error", async () => {
    const stub = buildInsertStub({
      error: { code: "23505", message: "duplicate key" },
    });
    const result = await saveCheckin(stub, {
      userId: "user-1",
      weekStart: "2026-05-11",
      rawResponses: {},
      submittedAt: "2026-05-15T10:00:00.000Z",
    });
    expect(result.duplicated).toBe(true);
    expect(result.row).toBeNull();
  });

  it("throws on other DB errors", async () => {
    const stub = buildInsertStub({
      error: { code: "42P01", message: "relation does not exist" },
    });
    await expect(
      saveCheckin(stub, {
        userId: "user-1",
        weekStart: "2026-05-11",
        rawResponses: {},
        submittedAt: "2026-05-15T10:00:00.000Z",
      }),
    ).rejects.toThrow(/relation does not exist/);
  });
});

describe("getWeekSubmitters", () => {
  it("returns a set of user_ids", async () => {
    const stub = buildSelectStub([{ user_id: "u1" }, { user_id: "u2" }, { user_id: "u1" }]);
    const out = await getWeekSubmitters(stub, "2026-05-11");
    expect(out.size).toBe(2);
    expect(out.has("u1")).toBe(true);
    expect(out.has("u2")).toBe(true);
  });
});

/**
 * Fluent stub for the latest-checkin chain:
 *   .from("weekly_checkins").select(...).eq(...).order(...).limit(1).maybeSingle()
 */
function buildLatestStub(
  row: {
    id: string;
    user_id: string;
    week_start: string;
    raw_responses: unknown;
    submitted_at: string;
  } | null,
): CheckinSupabase {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as CheckinSupabase;
}

describe("getLatestCheckinForUser", () => {
  it("returns the parsed latest row", async () => {
    const stub = buildLatestStub({
      id: "row-1",
      user_id: "user-1",
      week_start: "2026-05-11",
      raw_responses: { "11. Wins": "shipped" },
      submitted_at: "2026-05-15T10:00:00.000Z",
    });
    const out = await getLatestCheckinForUser(stub, "user-1");
    expect(out).not.toBeNull();
    expect(out?.weekStart).toBe("2026-05-11");
    expect(out?.rawResponses).toEqual({ "11. Wins": "shipped" });
  });

  it("returns null when the user has no check-ins", async () => {
    const stub = buildLatestStub(null);
    const out = await getLatestCheckinForUser(stub, "user-1");
    expect(out).toBeNull();
  });
});
