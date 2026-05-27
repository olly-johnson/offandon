import { afterEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmailMock = vi.fn();
const createServerClientMock = vi.fn(() => ({
  auth: { resetPasswordForEmail: resetPasswordForEmailMock },
}));

vi.mock("@/lib/shared/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(createServerClientMock()),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
process.env.NEXT_PUBLIC_SITE_URL = "https://botos.test";

const { requestPasswordReset } = await import("./actions");

function makeForm(data: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(data)) form.append(k, v);
  return form;
}

describe("requestPasswordReset", () => {
  afterEach(() => {
    resetPasswordForEmailMock.mockReset();
  });

  it("rejects invalid email", async () => {
    const result = await requestPasswordReset(
      {},
      makeForm({ email: "not-an-email" }),
    );
    expect(result.error).toBeDefined();
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("calls supabase.auth.resetPasswordForEmail with a /auth/confirm redirectTo and reports success", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({ error: null });

    const result = await requestPasswordReset(
      {},
      makeForm({ email: "User@Example.com" }),
    );

    expect(resetPasswordForEmailMock).toHaveBeenCalledTimes(1);
    const [email, opts] = resetPasswordForEmailMock.mock.calls[0];
    expect(email).toBe("user@example.com");
    expect(opts.redirectTo).toContain("/auth/confirm");
    expect(opts.redirectTo).toContain("next=%2Fauth%2Freset-password");
    expect(result.sent).toBe("user@example.com");
    expect(result.error).toBeUndefined();
  });

  it("returns a generic success message even when Supabase errors (no user enumeration)", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      error: { code: "user_not_found", status: 404, message: "no user" },
    });

    const result = await requestPasswordReset(
      {},
      makeForm({ email: "ghost@example.com" }),
    );

    expect(result.sent).toBe("ghost@example.com");
    expect(result.error).toBeUndefined();
  });
});
