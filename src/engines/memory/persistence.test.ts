import { describe, expect, it, vi } from "vitest";

import {
  deleteMemory,
  listMemoriesForUser,
  saveMemories,
  type MemorySupabaseClient,
} from "./persistence";

describe("saveMemories", () => {
  it("bulk-inserts each fact with user_id and conversation linkage", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await saveMemories(supabase, {
      userId: "user-1",
      conversationId: "conv-1",
      facts: [
        { fact: "Launching a $5K MRR offer", category: "ongoing_project", priority: 4 },
        { fact: "Prefers metaphors from running", category: "preference", priority: 2 },
      ],
    });

    expect(from).toHaveBeenCalledWith("user_memories");
    expect(insert).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        fact: "Launching a $5K MRR offer",
        category: "ongoing_project",
        priority: 4,
        source_conversation_id: "conv-1",
      },
      {
        user_id: "user-1",
        fact: "Prefers metaphors from running",
        category: "preference",
        priority: 2,
        source_conversation_id: "conv-1",
      },
    ]);
  });

  it("noops when given an empty facts array", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as MemorySupabaseClient;

    await saveMemories(supabase, {
      userId: "user-1",
      conversationId: null,
      facts: [],
    });

    expect(from).not.toHaveBeenCalled();
  });

  it("trims facts and skips blanks", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await saveMemories(supabase, {
      userId: "user-1",
      conversationId: null,
      facts: [
        { fact: "  Good fact  ", category: "recent_topic", priority: 1 },
        { fact: "   ", category: "recent_topic", priority: 1 },
      ],
    });

    const rows = insert.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].fact).toBe("Good fact");
  });

  it("clamps priority to 1..5", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await saveMemories(supabase, {
      userId: "user-1",
      conversationId: null,
      facts: [
        { fact: "x", category: "preference", priority: 0 },
        { fact: "y", category: "preference", priority: 9 },
      ],
    });

    const rows = insert.mock.calls[0][0];
    expect(rows[0].priority).toBe(1);
    expect(rows[1].priority).toBe(5);
  });

  it("throws on insert error", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { code: "x", message: "boom" } });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await expect(
      saveMemories(supabase, {
        userId: "user-1",
        conversationId: null,
        facts: [{ fact: "x", category: "preference", priority: 3 }],
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("listMemoriesForUser", () => {
  it("queries by user_id, orders priority desc then created_at desc, applies limit", async () => {
    const rows = [
      {
        id: "m1",
        fact: "ongoing thing",
        category: "ongoing_project",
        priority: 5,
        source_conversation_id: "c1",
        created_at: "2026-05-11T10:00:00.000Z",
      },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order2 = vi.fn().mockReturnValue({ limit });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MemorySupabaseClient;

    const out = await listMemoriesForUser(supabase, "user-1", 8);

    expect(out).toEqual(rows);
    expect(from).toHaveBeenCalledWith("user_memories");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order1).toHaveBeenCalledWith("priority", { ascending: false });
    expect(order2).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(8);
  });

  it("returns [] when data is null", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: null });
    const order2 = vi.fn().mockReturnValue({ limit });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MemorySupabaseClient;

    expect(await listMemoriesForUser(supabase, "user-1")).toEqual([]);
  });

  it("throws on query error", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "x", message: "boom" } });
    const order2 = vi.fn().mockReturnValue({ limit });
    const order1 = vi.fn().mockReturnValue({ order: order2 });
    const eq = vi.fn().mockReturnValue({ order: order1 });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await expect(listMemoriesForUser(supabase, "user-1")).rejects.toThrow(/boom/);
  });
});

describe("deleteMemory", () => {
  it("deletes the row by id (RLS confines to the caller)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await deleteMemory(supabase, "mem-1");

    expect(from).toHaveBeenCalledWith("user_memories");
    expect(eq).toHaveBeenCalledWith("id", "mem-1");
  });

  it("throws on delete error", async () => {
    const eq = vi.fn().mockResolvedValue({ error: { code: "x", message: "boom" } });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as MemorySupabaseClient;

    await expect(deleteMemory(supabase, "mem-1")).rejects.toThrow(/boom/);
  });
});
