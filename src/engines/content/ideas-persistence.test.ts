import { describe, expect, it, vi } from "vitest";

import {
  listIdeasForUser,
  saveIdea,
  type ContentSupabaseClient,
} from "./ideas-persistence";

describe("saveIdea", () => {
  it("inserts a chat-sourced idea linked to the conversation + message and returns the new id", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: "idea-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    const id = await saveIdea(supabase, {
      userId: "user-1",
      content: "Hook angle: the operator who never used a CRM",
      source: "chat",
      conversationId: "conv-1",
      messageId: "msg-9",
      pillar: "Operator Frameworks",
    });

    expect(id).toBe("idea-1");
    expect(from).toHaveBeenCalledWith("ideas");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      content: "Hook angle: the operator who never used a CRM",
      source: "chat",
      conversation_id: "conv-1",
      message_id: "msg-9",
      pillar: "Operator Frameworks",
    });
  });

  it("inserts a manual idea with NULL conversation_id, message_id, and pillar", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: { id: "idea-2" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await saveIdea(supabase, {
      userId: "user-1",
      content: "Random shower thought",
      source: "manual",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      content: "Random shower thought",
      source: "manual",
      conversation_id: null,
      message_id: null,
      pillar: null,
    });
  });

  it("trims content before insert and rejects empty strings", async () => {
    const supabase = { from: vi.fn() } as unknown as ContentSupabaseClient;
    await expect(
      saveIdea(supabase, { userId: "u", content: "   ", source: "manual" }),
    ).rejects.toThrow(/empty|blank/i);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("throws on insert error", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { code: "42501", message: "denied" },
      });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await expect(
      saveIdea(supabase, {
        userId: "u",
        content: "x",
        source: "manual",
      }),
    ).rejects.toThrow(/denied/);
  });
});

describe("listIdeasForUser", () => {
  it("queries ideas for the user, newest first, with the supplied limit", async () => {
    const rows = [
      {
        id: "i1",
        content: "first",
        pillar: null,
        source: "chat",
        conversation_id: "c1",
        message_id: "m1",
        created_at: "2026-05-11T10:00:00.000Z",
      },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as ContentSupabaseClient;

    const result = await listIdeasForUser(supabase, "user-1", 25);

    expect(result).toEqual(rows);
    expect(from).toHaveBeenCalledWith("ideas");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(25);
  });

  it("returns an empty array when the underlying query returns null data", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as ContentSupabaseClient;

    const result = await listIdeasForUser(supabase, "user-1");

    expect(result).toEqual([]);
  });

  it("throws on query error", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { code: "x", message: "boom" },
      });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as ContentSupabaseClient;

    await expect(listIdeasForUser(supabase, "user-1")).rejects.toThrow(/boom/);
  });
});
