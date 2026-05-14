import { describe, expect, it, vi } from "vitest";

import {
  addRule,
  deleteRule,
  listRulesForSlicePrompt,
  loadMethodologySlice,
  saveHouseSlice,
  updateRule,
  type MasterBotSupabaseClient,
} from "./persistence";

describe("addRule", () => {
  it("inserts the trimmed rule and returns the new row", async () => {
    const row = {
      id: "r-1",
      slice: "scripts",
      rule: "never recommend pricing",
      created_at: "2026-05-14T00:00:00Z",
      updated_at: "2026-05-14T00:00:00Z",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    const out = await addRule(sb, {
      slice: "scripts",
      rule: "  never recommend pricing  ",
      createdBy: "admin-1",
    });

    expect(from).toHaveBeenCalledWith("methodology_rules");
    expect(insert).toHaveBeenCalledWith({
      slice: "scripts",
      rule: "never recommend pricing",
      created_by: "admin-1",
    });
    expect(out).toEqual(row);
  });

  it("rejects empty rules", async () => {
    const sb = {} as unknown as MasterBotSupabaseClient;
    await expect(
      addRule(sb, { slice: "house", rule: "   ", createdBy: null }),
    ).rejects.toThrow(/empty/i);
  });
});

describe("updateRule", () => {
  it("only updates rows that are not soft-deleted", async () => {
    const row = {
      id: "r-1",
      slice: "chat",
      rule: "be terse",
      created_at: "2026-05-14T00:00:00Z",
      updated_at: "2026-05-14T01:00:00Z",
    };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    await updateRule(sb, { id: "r-1", rule: "be terse" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ rule: "be terse", updated_at: expect.any(String) }),
    );
    expect(eq).toHaveBeenCalledWith("id", "r-1");
    expect(is).toHaveBeenCalledWith("deleted_at", null);
  });
});

describe("deleteRule", () => {
  it("soft-deletes by setting deleted_at", async () => {
    const is = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    await deleteRule(sb, { id: "r-1" });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );
    expect(eq).toHaveBeenCalledWith("id", "r-1");
  });
});

describe("listRulesForSlicePrompt", () => {
  it("returns house rules + slice rules in created order", async () => {
    const rows = [
      { rule: "house rule a", slice: "house" },
      { rule: "scripts rule a", slice: "scripts" },
      { rule: "house rule b", slice: "house" },
    ];
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const inFn = vi.fn().mockReturnValue({ order });
    const is = vi.fn().mockReturnValue({ in: inFn });
    const select = vi.fn().mockReturnValue({ is });
    const from = vi.fn().mockReturnValue({ select });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    const out = await listRulesForSlicePrompt(sb, "scripts");
    expect(out).toEqual(["house rule a", "scripts rule a", "house rule b"]);
    expect(inFn).toHaveBeenCalledWith("slice", ["house", "scripts"]);
  });
});

describe("loadMethodologySlice", () => {
  it("returns DB content when a row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { content: "DB content" },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    const out = await loadMethodologySlice(sb, "chat");
    expect(out).toBe("DB content");
  });

  it("falls back to the file default when DB has no row", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    const out = await loadMethodologySlice(sb, "chat");
    // File default contains the chat methodology header.
    expect(out).toContain("Chat");
    expect(out.length).toBeGreaterThan(50);
  });

  it("falls back to the file default when DB read errors", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    const out = await loadMethodologySlice(sb, "house");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("saveHouseSlice", () => {
  it("snapshots prior content to versions then upserts new content", async () => {
    const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

    const versionsInsert = vi.fn().mockResolvedValue({ error: null });
    const houseUpsert = vi.fn().mockResolvedValue({ error: null });
    const houseMaybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { content: "prior content" }, error: null });
    const houseEq = vi.fn().mockReturnValue({ maybeSingle: houseMaybeSingle });
    const houseSelect = vi.fn().mockReturnValue({ eq: houseEq });

    const from = vi.fn().mockImplementation((table: string) => {
      calls.push({ table, op: "from" });
      if (table === "house_methodology_versions") {
        return { insert: (p: unknown) => { calls.push({ table, op: "insert", payload: p }); return versionsInsert(); } };
      }
      if (table === "house_methodology") {
        return {
          select: houseSelect,
          upsert: (p: unknown) => { calls.push({ table, op: "upsert", payload: p }); return houseUpsert(); },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const sb = { from } as unknown as MasterBotSupabaseClient;

    await saveHouseSlice(sb, {
      slice: "scripts",
      newContent: "new scripts content",
      summary: "Adds Russian Doll structure",
      updatedBy: "admin-1",
    });

    const versionInsert = calls.find((c) => c.op === "insert");
    expect(versionInsert?.payload).toMatchObject({
      slice: "scripts",
      content: "prior content",
      summary: "Adds Russian Doll structure",
    });

    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.payload).toMatchObject({
      slice: "scripts",
      content: "new scripts content",
      updated_by: "admin-1",
    });
  });

  it("rejects an empty summary (admin must see WHY the change was made)", async () => {
    const sb = {} as unknown as MasterBotSupabaseClient;
    await expect(
      saveHouseSlice(sb, {
        slice: "scripts",
        newContent: "anything",
        summary: "   ",
        updatedBy: null,
      }),
    ).rejects.toThrow(/summary/i);
  });
});
