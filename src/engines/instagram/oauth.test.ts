import { describe, expect, it, vi } from "vitest";

import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  InstagramOAuthError,
  REQUIRED_OAUTH_SCOPES,
} from "./oauth";

const CONFIG = {
  appId: "1345018754107696",
  appSecret: "secret-xxx",
  redirectUri: "https://botos.example/api/auth/instagram/callback",
};

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("buildAuthorizeUrl", () => {
  it("targets the instagram.com OAuth authorize endpoint", () => {
    const url = buildAuthorizeUrl({ config: CONFIG, state: "abc" });
    expect(url).toMatch(/^https:\/\/www\.instagram\.com\/oauth\/authorize\?/);
  });

  it("includes all required query params", () => {
    const url = new URL(buildAuthorizeUrl({ config: CONFIG, state: "abc" }));
    expect(url.searchParams.get("client_id")).toBe(CONFIG.appId);
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("scope")).toBe(REQUIRED_OAUTH_SCOPES.join(","));
  });

  it("honours a custom scopes override", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config: CONFIG,
        state: "x",
        scopes: ["instagram_business_basic"],
      }),
    );
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
  });
});

describe("exchangeCodeForToken", () => {
  it("POSTs the form fields to api.instagram.com/oauth/access_token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ access_token: "IGAA-short", user_id: 17841 }),
    );

    await exchangeCodeForToken({
      config: CONFIG,
      code: "AQ-code",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.instagram.com/oauth/access_token");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get("client_id")).toBe(CONFIG.appId);
    expect(body.get("client_secret")).toBe(CONFIG.appSecret);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(body.get("code")).toBe("AQ-code");
  });

  it("returns the parsed short-lived token shape", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "IGAA-short",
        user_id: 17841,
        permissions: "instagram_business_basic",
      }),
    );
    const out = await exchangeCodeForToken({
      config: CONFIG,
      code: "x",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out).toEqual({
      access_token: "IGAA-short",
      user_id: 17841,
      permissions: "instagram_business_basic",
    });
  });

  it("throws InstagramOAuthError with a friendly redirect-mismatch message", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error_type: "OAuthException",
          code: 400,
          error_message:
            "Error validating verification code. Please make sure your redirect_uri is identical...",
        },
        { status: 400 },
      ),
    );
    await expect(
      exchangeCodeForToken({
        config: CONFIG,
        code: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "InstagramOAuthError",
      message: expect.stringMatching(/redirect URI/i),
    });
  });

  it("throws on malformed success payload", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ foo: "bar" }));
    await expect(
      exchangeCodeForToken({
        config: CONFIG,
        code: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(InstagramOAuthError);
  });
});

describe("exchangeForLongLivedToken", () => {
  it("GETs graph.instagram.com/access_token with the right query params", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "IGAA-long",
        token_type: "bearer",
        expires_in: 5183944,
      }),
    );

    await exchangeForLongLivedToken({
      config: CONFIG,
      shortLivedToken: "IGAA-short",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe(
      "https://graph.instagram.com/access_token",
    );
    expect(u.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(u.searchParams.get("client_secret")).toBe(CONFIG.appSecret);
    expect(u.searchParams.get("access_token")).toBe("IGAA-short");
    expect(init.method).toBe("GET");
  });

  it("returns the parsed long-lived token shape", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "IGAA-long",
        token_type: "bearer",
        expires_in: 5183944,
      }),
    );
    const out = await exchangeForLongLivedToken({
      config: CONFIG,
      shortLivedToken: "IGAA-short",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.access_token).toBe("IGAA-long");
    expect(out.expires_in).toBe(5183944);
  });

  it("throws InstagramOAuthError on API error", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            message: "Error validating client secret.",
            type: "IGApiException",
            code: 100,
          },
        },
        { status: 400 },
      ),
    );
    await expect(
      exchangeForLongLivedToken({
        config: CONFIG,
        shortLivedToken: "x",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      name: "InstagramOAuthError",
      message: expect.stringContaining("client secret"),
    });
  });
});
