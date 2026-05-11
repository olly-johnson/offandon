import { describe, expect, it, vi } from "vitest";

import {
  enforceInviteRateLimit,
  INVITE_RATE_LIMIT_MAX,
  INVITE_RATE_LIMIT_WINDOW_MS,
  InviteRateLimitError,
  type AdminInviteSupabaseClient,
} from "./rate-limit";

function fakeSupabase(count: number): AdminInviteSupabaseClient {
  const gte = vi.fn().mockResolvedValue({ count, error: null });
  const eq2 = vi.fn().mockReturnValue({ gte });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as AdminInviteSupabaseClient;
}

describe("enforceInviteRateLimit", () => {
  it("resolves silently when under the limit", async () => {
    const supabase = fakeSupabase(INVITE_RATE_LIMIT_MAX - 1);
    await expect(
      enforceInviteRateLimit({
        supabase,
        adminId: "admin-1",
        now: new Date(),
      }),
    ).resolves.toBeUndefined();
  });

  it("throws InviteRateLimitError at the limit", async () => {
    const supabase = fakeSupabase(INVITE_RATE_LIMIT_MAX);
    await expect(
      enforceInviteRateLimit({
        supabase,
        adminId: "admin-1",
        now: new Date(),
      }),
    ).rejects.toBeInstanceOf(InviteRateLimitError);
  });

  it("uses the configured rolling window when computing the cutoff", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 0, error: null });
    const eq2 = vi.fn().mockReturnValue({ gte });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as AdminInviteSupabaseClient;

    const now = new Date("2026-05-11T12:00:00.000Z");
    await enforceInviteRateLimit({ supabase, adminId: "admin-1", now });

    const cutoff = new Date(
      now.getTime() - INVITE_RATE_LIMIT_WINDOW_MS,
    ).toISOString();
    expect(gte).toHaveBeenCalledWith("created_at", cutoff);
  });

  it("uses INVITE_RATE_LIMIT_MAX = 10 invites and a 1-hour window", () => {
    expect(INVITE_RATE_LIMIT_MAX).toBe(10);
    expect(INVITE_RATE_LIMIT_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});
