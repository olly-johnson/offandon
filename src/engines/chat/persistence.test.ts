import { describe, expect, it, vi } from "vitest";

import {
  appendMessage,
  createConversation,
  deleteConversation,
  type ChatSupabaseClient,
} from "./persistence";

describe("createConversation", () => {
  it("inserts a row owned by the user with the derived title and returns its id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ChatSupabaseClient;

    const id = await createConversation(supabase, {
      userId: "user-1",
      title: "Hook ideas for operators",
    });

    expect(id).toBe("conv-1");
    expect(from).toHaveBeenCalledWith("conversations");
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      title: "Hook ideas for operators",
    });
  });

  it("truncates a long title to 80 chars with an ellipsis", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "conv-1" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ChatSupabaseClient;

    const long = "x".repeat(200);
    await createConversation(supabase, { userId: "user-1", title: long });

    const row = insert.mock.calls[0][0];
    expect(row.title).toHaveLength(80);
    expect(row.title.endsWith("...")).toBe(true);
  });

  it("throws on insert error", async () => {
    const single = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as ChatSupabaseClient;

    await expect(
      createConversation(supabase, { userId: "user-1", title: "x" }),
    ).rejects.toThrow(/denied/);
  });
});

describe("appendMessage", () => {
  it("inserts a single message with the role and content provided", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const conversationsUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "messages") return { insert };
      if (table === "conversations") return { update: conversationsUpdate };
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as ChatSupabaseClient;

    await appendMessage(supabase, {
      conversationId: "conv-1",
      userId: "user-1",
      role: "user",
      content: "hello",
    });

    expect(insert).toHaveBeenCalledWith({
      conversation_id: "conv-1",
      user_id: "user-1",
      role: "user",
      content: "hello",
    });
  });

  it("bumps the parent conversation's updated_at after writing the message", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "messages") return { insert };
      if (table === "conversations") return { update };
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as ChatSupabaseClient;

    await appendMessage(supabase, {
      conversationId: "conv-1",
      userId: "user-1",
      role: "assistant",
      content: "reply",
    });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ updated_at: expect.any(String) }));
    expect(eq).toHaveBeenCalledWith("id", "conv-1");
  });

  it("throws on message insert error and does NOT bump conversation timestamp", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "x", message: "boom" } });
    const update = vi.fn();
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === "messages") return { insert };
      if (table === "conversations") return { update };
      throw new Error(`unexpected table: ${table}`);
    });
    const supabase = { from } as unknown as ChatSupabaseClient;

    await expect(
      appendMessage(supabase, {
        conversationId: "conv-1",
        userId: "user-1",
        role: "user",
        content: "hi",
      }),
    ).rejects.toThrow(/boom/);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("deleteConversation", () => {
  it("calls delete on conversations filtered by id and returns the count", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null, count: 1 });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as ChatSupabaseClient;

    const count = await deleteConversation(supabase, "conv-1");

    expect(count).toBe(1);
    expect(from).toHaveBeenCalledWith("conversations");
    expect(del).toHaveBeenCalledWith({ count: "exact" });
    expect(eq).toHaveBeenCalledWith("id", "conv-1");
  });

  it("returns 0 when no row matched (cross-tenant id or already deleted)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null, count: 0 });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as ChatSupabaseClient;

    const count = await deleteConversation(supabase, "some-other-conv");
    expect(count).toBe(0);
  });

  it("throws when supabase returns an error", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({ error: { code: "42501", message: "denied" }, count: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as ChatSupabaseClient;

    await expect(deleteConversation(supabase, "conv-1")).rejects.toThrow(/denied/);
  });
});
