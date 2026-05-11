import { describe, expect, it, vi } from "vitest";

import {
  getUserMethodology,
  upsertUserMethodology,
  type MethodologySupabaseClient,
} from "./persistence";

describe("getUserMethodology", () => {
  it("returns the content string when a row exists", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { content: "no unlocks" }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    const out = await getUserMethodology(supabase, "user-1");

    expect(out).toBe("no unlocks");
    expect(from).toHaveBeenCalledWith("user_methodology");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns null when no row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    const out = await getUserMethodology(supabase, "user-1");
    expect(out).toBeNull();
  });

  it("throws on query error", async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "x", message: "boom" } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    await expect(getUserMethodology(supabase, "user-1")).rejects.toThrow(/boom/);
  });
});

describe("upsertUserMethodology", () => {
  it("upserts on user_id with the trimmed content", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    await upsertUserMethodology(supabase, {
      userId: "user-1",
      content: "  no unlocks. running metaphors only.  ",
    });

    expect(from).toHaveBeenCalledWith("user_methodology");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        content: "no unlocks. running metaphors only.",
      },
      { onConflict: "user_id" },
    );
  });

  it("stores an empty string when the content is blank (clears the overlay)", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    await upsertUserMethodology(supabase, { userId: "user-1", content: "   " });

    expect(upsert).toHaveBeenCalledWith(
      { user_id: "user-1", content: "" },
      { onConflict: "user_id" },
    );
  });

  it("throws on upsert error", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as MethodologySupabaseClient;

    await expect(
      upsertUserMethodology(supabase, { userId: "user-1", content: "x" }),
    ).rejects.toThrow(/denied/);
  });
});
