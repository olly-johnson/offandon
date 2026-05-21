import { afterEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const updateUserMock = vi.fn();

const supabaseStub = {
  auth: {
    getUser: getUserMock,
    signInWithPassword: signInWithPasswordMock,
    updateUser: updateUserMock,
  },
};

vi.mock("@/lib/shared/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(supabaseStub),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

const { changePassword } = await import("./actions");

function makeForm(data: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(data)) form.append(k, v);
  return form;
}

describe("changePassword", () => {
  afterEach(() => {
    getUserMock.mockReset();
    signInWithPasswordMock.mockReset();
    updateUserMock.mockReset();
  });

  it("rejects when no user is signed in", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });

    const result = await changePassword(
      {},
      makeForm({
        currentPassword: "abcdefgh",
        password: "newpass123",
        confirm: "newpass123",
      }),
    );

    expect(result.error).toBe("Sign in first.");
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("rejects when passwords do not match", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@x.com" } },
    });

    const result = await changePassword(
      {},
      makeForm({
        currentPassword: "oldpass12",
        password: "newpass123",
        confirm: "different1",
      }),
    );

    expect(result.error).toMatch(/match/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("rejects when current password is wrong", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@x.com" } },
    });
    signInWithPasswordMock.mockResolvedValueOnce({
      error: { code: "invalid_credentials", status: 400 },
    });

    const result = await changePassword(
      {},
      makeForm({
        currentPassword: "wrongpass",
        password: "newpass123",
        confirm: "newpass123",
      }),
    );

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "u@x.com",
      password: "wrongpass",
    });
    expect(result.error).toMatch(/current password/i);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("updates the password when the current password verifies", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@x.com" } },
    });
    signInWithPasswordMock.mockResolvedValueOnce({ error: null });
    updateUserMock.mockResolvedValueOnce({ error: null });

    const result = await changePassword(
      {},
      makeForm({
        currentPassword: "oldpass12",
        password: "newpass123",
        confirm: "newpass123",
      }),
    );

    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpass123" });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("surfaces a generic error when updateUser fails", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@x.com" } },
    });
    signInWithPasswordMock.mockResolvedValueOnce({ error: null });
    updateUserMock.mockResolvedValueOnce({
      error: { code: "weak_password", status: 400 },
    });

    const result = await changePassword(
      {},
      makeForm({
        currentPassword: "oldpass12",
        password: "newpass123",
        confirm: "newpass123",
      }),
    );

    expect(result.error).toBeDefined();
    expect(result.ok).toBeUndefined();
  });
});
