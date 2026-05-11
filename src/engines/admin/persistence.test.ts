import { describe, expect, it, vi } from "vitest";

import {
  countInvitesByAdminSince,
  listRecentInvites,
  recordInvite,
  type AdminSupabaseClient,
} from "./persistence";

describe("recordInvite", () => {
  it("inserts a row with normalised email + 'sent' status by default", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await recordInvite(supabase, {
      invitedBy: "admin-1",
      email: "  Olly@Example.COM  ",
    });

    expect(from).toHaveBeenCalledWith("admin_invites");
    expect(insert).toHaveBeenCalledWith({
      invited_by: "admin-1",
      email: "olly@example.com",
      status: "sent",
      error: null,
    });
  });

  it("records 'failed' status with the error message when supplied", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await recordInvite(supabase, {
      invitedBy: "admin-1",
      email: "x@y.com",
      status: "failed",
      error: "rate_limited",
    });

    expect(insert).toHaveBeenCalledWith({
      invited_by: "admin-1",
      email: "x@y.com",
      status: "failed",
      error: "rate_limited",
    });
  });

  it("throws on insert error", async () => {
    const insert = vi
      .fn()
      .mockResolvedValue({ error: { code: "42501", message: "denied" } });
    const from = vi.fn().mockReturnValue({ insert });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await expect(
      recordInvite(supabase, { invitedBy: "admin-1", email: "x@y.com" }),
    ).rejects.toThrow(/denied/);
  });
});

describe("listRecentInvites", () => {
  it("returns the rows ordered by created_at desc with default limit 20", async () => {
    const rows = [
      { id: "1", invited_by: "a", email: "x@y.com", status: "sent" },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    const out = await listRecentInvites(supabase);

    expect(out).toEqual(rows);
    expect(from).toHaveBeenCalledWith("admin_invites");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(20);
  });

  it("honours a custom limit", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await listRecentInvites(supabase, { limit: 5 });
    expect(limit).toHaveBeenCalledWith(5);
  });

  it("returns [] when supabase returns null data", async () => {
    const limit = vi.fn().mockResolvedValue({ data: null, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    expect(await listRecentInvites(supabase)).toEqual([]);
  });

  it("throws on query error", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await expect(listRecentInvites(supabase)).rejects.toThrow(/boom/);
  });
});

describe("countInvitesByAdminSince", () => {
  it("counts only the inviter's 'sent' rows since the cutoff", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 3, error: null });
    const eq2 = vi.fn().mockReturnValue({ gte });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    const since = new Date("2026-05-11T11:00:00.000Z");
    const count = await countInvitesByAdminSince(supabase, {
      adminId: "admin-1",
      since,
    });

    expect(count).toBe(3);
    expect(from).toHaveBeenCalledWith("admin_invites");
    expect(select).toHaveBeenCalledWith("*", { count: "exact", head: true });
    expect(eq1).toHaveBeenCalledWith("invited_by", "admin-1");
    expect(eq2).toHaveBeenCalledWith("status", "sent");
    expect(gte).toHaveBeenCalledWith("created_at", since.toISOString());
  });

  it("treats null count as 0", async () => {
    const gte = vi.fn().mockResolvedValue({ count: null, error: null });
    const eq2 = vi.fn().mockReturnValue({ gte });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    expect(
      await countInvitesByAdminSince(supabase, {
        adminId: "admin-1",
        since: new Date(),
      }),
    ).toBe(0);
  });

  it("throws on query error", async () => {
    const gte = vi
      .fn()
      .mockResolvedValue({ count: null, error: { message: "fail" } });
    const eq2 = vi.fn().mockReturnValue({ gte });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminSupabaseClient;

    await expect(
      countInvitesByAdminSince(supabase, {
        adminId: "admin-1",
        since: new Date(),
      }),
    ).rejects.toThrow(/fail/);
  });
});
