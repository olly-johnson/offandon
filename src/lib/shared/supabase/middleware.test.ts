import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Mock @supabase/ssr before importing the module under test so the
// real createServerClient is never reached. Each test sets the
// in-flight mock implementation.
const getUserMock = vi.fn();
const createServerClientMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

// Set required env so the middleware module loads cleanly.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

// Imported after mocks/env so the env reads succeed.
const { updateSession } = await import("./middleware");

function makeSupabaseClient(getUserResult: { error: { code: string; status: number } | null }) {
  getUserMock.mockResolvedValueOnce(getUserResult);
  return {
    auth: { getUser: getUserMock },
  };
}

function makeRequestWithAuthCookies() {
  const req = new NextRequest("https://example.com/dashboard");
  // Two chunks: Supabase splits long session payloads across `.0` / `.1`.
  req.cookies.set("sb-abcd-auth-token.0", "stale-chunk-0");
  req.cookies.set("sb-abcd-auth-token.1", "stale-chunk-1");
  // Unrelated cookie that must NOT be cleared.
  req.cookies.set("preferences-theme", "dark");
  return req;
}

describe("updateSession (middleware)", () => {
  it("clears the supabase auth cookies when the refresh token has already been used", async () => {
    createServerClientMock.mockImplementation(() =>
      makeSupabaseClient({ error: { code: "refresh_token_already_used", status: 400 } }),
    );

    const req = makeRequestWithAuthCookies();
    const res = await updateSession(req);

    // delete() on NextResponse cookies appends a Set-Cookie that drives the
    // browser to expire the cookie. Inspect the outgoing cookie state.
    const outgoing = res.cookies.getAll();
    const cleared = outgoing.filter((c) => c.value === "");

    expect(cleared.map((c) => c.name)).toEqual(
      expect.arrayContaining(["sb-abcd-auth-token.0", "sb-abcd-auth-token.1"]),
    );
    // The unrelated cookie must not be touched.
    expect(outgoing.find((c) => c.name === "preferences-theme" && c.value === "")).toBeUndefined();
  });

  it("clears the supabase auth cookies on refresh_token_not_found", async () => {
    createServerClientMock.mockImplementation(() =>
      makeSupabaseClient({ error: { code: "refresh_token_not_found", status: 400 } }),
    );

    const req = makeRequestWithAuthCookies();
    const res = await updateSession(req);

    const cleared = res.cookies.getAll().filter((c) => c.value === "");
    expect(cleared.length).toBeGreaterThanOrEqual(2);
  });

  it("does NOT clear cookies on a generic non-401 error", async () => {
    createServerClientMock.mockImplementation(() =>
      makeSupabaseClient({ error: { code: "some_other_error", status: 500 } }),
    );

    const req = makeRequestWithAuthCookies();
    const res = await updateSession(req);

    const cleared = res.cookies.getAll().filter((c) => c.value === "");
    expect(cleared).toHaveLength(0);
  });

  it("does NOT clear cookies on a successful auth check", async () => {
    createServerClientMock.mockImplementation(() => makeSupabaseClient({ error: null }));

    const req = makeRequestWithAuthCookies();
    const res = await updateSession(req);

    const cleared = res.cookies.getAll().filter((c) => c.value === "");
    expect(cleared).toHaveLength(0);
  });
});
