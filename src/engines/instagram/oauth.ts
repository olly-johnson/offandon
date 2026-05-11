/**
 * Instagram OAuth helpers.
 *
 * Three steps, used by /api/auth/instagram/callback:
 *
 *   1. buildAuthorizeUrl(state)          construct the IG consent URL
 *   2. exchangeCodeForToken(code, ...)   short-lived token (~1h)
 *   3. exchangeForLongLivedToken(short)  60-day token
 *
 * Network shape mirrors the manual curl flow we used to ship Path B:
 *   POST https://api.instagram.com/oauth/access_token    (multipart form)
 *   GET  https://graph.instagram.com/access_token        (query string)
 *
 * Errors:
 *   InstagramOAuthError   API rejected the request (bad code, bad secret,
 *                         redirect mismatch). Caller turns this into a
 *                         user-visible error message.
 */

import type { InstagramAccountStats } from "./types";

export interface OAuthConfig {
  /** Instagram-app ID (NOT the FB app ID; usually the same number though). */
  appId: string;
  /** Instagram-app secret. */
  appSecret: string;
  /** Must match exactly a Valid OAuth Redirect URI registered on Meta. */
  redirectUri: string;
}

export interface ShortLivedTokenResponse {
  access_token: string;
  user_id: number;
  permissions?: string;
}

export interface LongLivedTokenResponse {
  access_token: string;
  token_type: "bearer";
  /** Seconds until expiry. ~60 days when freshly issued. */
  expires_in: number;
}

/** Scopes our app needs for the content library + dashboard metrics. */
export const REQUIRED_OAUTH_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
] as const;

export class InstagramOAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "InstagramOAuthError";
  }
}

/**
 * Build the URL we send the user to so Instagram can ask for consent.
 * `state` is an opaque random value we set on a short-lived cookie and
 * verify on the callback to defend against CSRF.
 */
export function buildAuthorizeUrl(args: {
  config: OAuthConfig;
  state: string;
  /** Override the scope list (tests). Defaults to REQUIRED_OAUTH_SCOPES. */
  scopes?: readonly string[];
}): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", args.config.appId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    (args.scopes ?? REQUIRED_OAUTH_SCOPES).join(","),
  );
  url.searchParams.set("state", args.state);
  return url.toString();
}

export interface OAuthFetchOptions {
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Exchange the one-shot `code` from the callback for a short-lived token
 * (~1h). Multipart form POST is the documented shape.
 */
export async function exchangeCodeForToken(args: {
  config: OAuthConfig;
  code: string;
  fetchImpl?: typeof fetch;
}): Promise<ShortLivedTokenResponse> {
  const f = args.fetchImpl ?? fetch;
  const body = new FormData();
  body.set("client_id", args.config.appId);
  body.set("client_secret", args.config.appSecret);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", args.config.redirectUri);
  body.set("code", args.code);

  const res = await f("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body,
  });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new InstagramOAuthError(
      `Token exchange returned non-JSON (HTTP ${res.status})`,
      res.status,
    );
  }

  if (!res.ok) {
    throw new InstagramOAuthError(
      shortLivedErrorMessage(parsed, res.status),
      res.status,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.access_token !== "string" || typeof obj.user_id !== "number") {
    throw new InstagramOAuthError(
      "Token exchange returned an unexpected shape (no access_token / user_id).",
      res.status,
      parsed,
    );
  }
  return {
    access_token: obj.access_token,
    user_id: obj.user_id,
    permissions: typeof obj.permissions === "string" ? obj.permissions : undefined,
  };
}

/**
 * Exchange a short-lived token for a long-lived (60-day) token. The
 * call goes against graph.instagram.com (not api.instagram.com) and
 * uses a GET with query params, not a form POST.
 */
export async function exchangeForLongLivedToken(args: {
  config: OAuthConfig;
  shortLivedToken: string;
  fetchImpl?: typeof fetch;
}): Promise<LongLivedTokenResponse> {
  const f = args.fetchImpl ?? fetch;
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", args.config.appSecret);
  url.searchParams.set("access_token", args.shortLivedToken);

  const res = await f(url.toString(), { method: "GET" });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new InstagramOAuthError(
      `Long-lived exchange returned non-JSON (HTTP ${res.status})`,
      res.status,
    );
  }

  if (!res.ok) {
    throw new InstagramOAuthError(
      longLivedErrorMessage(parsed, res.status),
      res.status,
      parsed,
    );
  }

  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.access_token !== "string" ||
    typeof obj.expires_in !== "number"
  ) {
    throw new InstagramOAuthError(
      "Long-lived exchange returned an unexpected shape.",
      res.status,
      parsed,
    );
  }
  return {
    access_token: obj.access_token,
    token_type: "bearer",
    expires_in: obj.expires_in,
  };
}

/**
 * Re-export the type so callers don't need to dig into the engine module
 * graph.
 */
export type { InstagramAccountStats };

function shortLivedErrorMessage(parsed: unknown, status: number): string {
  const msg = pickErrorMessage(parsed);
  if (msg && /redirect_uri/i.test(msg)) {
    return "Instagram rejected the OAuth redirect. The redirect URI on Bot OS does not match what is registered in your Meta app. Contact support.";
  }
  if (msg && /code/i.test(msg)) {
    return "Instagram rejected the verification code. It likely expired (codes are good for ~10 minutes). Try connecting again.";
  }
  if (msg && /secret/i.test(msg)) {
    return "Instagram rejected the app credentials. Server-side configuration issue.";
  }
  return msg ?? `Token exchange failed (HTTP ${status}).`;
}

function longLivedErrorMessage(parsed: unknown, status: number): string {
  const msg = pickErrorMessage(parsed);
  return msg ?? `Long-lived token exchange failed (HTTP ${status}).`;
}

function pickErrorMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.error_message === "string") return obj.error_message;
  const err = obj.error as Record<string, unknown> | undefined;
  if (err && typeof err.message === "string") return err.message;
  return null;
}

/**
 * Read OAuth config from env. Throws if any value is missing so the
 * callback fails loudly rather than silently emitting empty form fields.
 */
export function loadOAuthConfig(): OAuthConfig {
  const appId = process.env.IG_APP_ID;
  const appSecret = process.env.IG_APP_SECRET;
  const redirectUri = process.env.IG_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      "Instagram OAuth env missing. Set IG_APP_ID, IG_APP_SECRET, IG_OAUTH_REDIRECT_URI.",
    );
  }
  return { appId, appSecret, redirectUri };
}
