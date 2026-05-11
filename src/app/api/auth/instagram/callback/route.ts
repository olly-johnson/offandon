import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  InstagramOAuthError,
  loadOAuthConfig,
} from "@/engines/instagram/oauth";
import { InstagramClient } from "@/engines/instagram/client";
import { runInstagramSync } from "@/engines/instagram/sync";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("api.auth.instagram.callback");

export const OAUTH_STATE_COOKIE = "ig_oauth_state";

/**
 * Instagram OAuth callback.
 *
 * Flow:
 *   1. Verify the `state` query param matches the cookie we set when the
 *      user clicked Connect. Defends against CSRF + cross-site code
 *      relay.
 *   2. If Instagram redirected back with `?error=`, the user cancelled
 *      or the scope was rejected; redirect to /library with a friendly
 *      message.
 *   3. Exchange the one-shot `code` for a short-lived token.
 *   4. Exchange short-lived for the 60-day long-lived token.
 *   5. Run the initial sync (this is what populates the grid). On
 *      success, redirect to /library; on failure, redirect with the
 *      error in the query string and let the page surface it.
 *
 * The Supabase session cookie carries through this redirect chain, so
 * we can identify the user with auth.getUser() exactly as anywhere
 * else in the app.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/signin");
  }

  const sp = request.nextUrl.searchParams;
  const cookieJar = await cookies();

  const cookieState = cookieJar.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const queryState = sp.get("state");
  // Single-use; clear before any branch can return early.
  cookieJar.delete(OAUTH_STATE_COOKIE);

  if (!cookieState || !queryState || cookieState !== queryState) {
    log.warn("instagram oauth: state mismatch", {
      user_id: user.id,
      cookie_present: cookieState !== null,
      query_present: queryState !== null,
    });
    redirect(libraryWithError("State token mismatch. Try connecting again."));
  }

  const error = sp.get("error");
  const errorReason = sp.get("error_reason");
  const errorDescription = sp.get("error_description");
  if (error) {
    log.info("instagram oauth: user cancelled or scope denied", {
      user_id: user.id,
      error,
      error_reason: errorReason,
    });
    redirect(
      libraryWithError(
        errorReason === "user_denied"
          ? "Instagram connection cancelled."
          : `Instagram denied the connection: ${errorDescription ?? error}`,
      ),
    );
  }

  const code = sp.get("code");
  if (!code) {
    redirect(libraryWithError("Instagram did not return an authorisation code."));
  }

  let config;
  try {
    config = loadOAuthConfig();
  } catch (err) {
    log.error("instagram oauth: config missing", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    redirect(
      libraryWithError(
        "Server is not configured for Instagram OAuth. Contact support.",
      ),
    );
  }

  let shortToken;
  try {
    shortToken = await exchangeCodeForToken({ config, code });
  } catch (err) {
    log.warn("instagram oauth: short-lived exchange failed", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
      status: err instanceof InstagramOAuthError ? err.status : null,
    });
    redirect(libraryWithError(extractMessage(err)));
  }

  let longToken;
  try {
    longToken = await exchangeForLongLivedToken({
      config,
      shortLivedToken: shortToken.access_token,
    });
  } catch (err) {
    log.warn("instagram oauth: long-lived exchange failed", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    redirect(libraryWithError(extractMessage(err)));
  }

  // Use the service-role client for the sync writes. The user JWT we
  // verified above (getUser()) doesn't always propagate to PostgREST
  // requests reliably from a route handler, which trips RLS even when
  // the row's user_id matches the verified caller. We've already proved
  // identity for this request, so dropping into service-role for the
  // upserts is safe and matches the Inngest worker pattern.
  const adminSupabase = createSupabaseAdminClient();
  const client = new InstagramClient();
  const syncResult = await runInstagramSync({
    supabase: adminSupabase,
    client,
    userId: user.id,
    accessToken: longToken.access_token,
  });

  if (!syncResult.ok) {
    log.warn("instagram oauth: initial sync failed", {
      user_id: user.id,
      error: syncResult.error,
    });
    redirect(
      libraryWithError(
        `Connected but initial sync failed: ${syncResult.error ?? "unknown"}. Hit Refresh on the library page.`,
      ),
    );
  }

  log.info("instagram oauth: connected", {
    user_id: user.id,
    media_count: syncResult.mediaCount,
    followers: syncResult.followersCount,
  });

  redirect("/library?ig_connected=1");
}

function libraryWithError(message: string): string {
  return `/library?ig_error=${encodeURIComponent(message)}`;
}

function extractMessage(err: unknown): string {
  if (err instanceof InstagramOAuthError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error connecting Instagram.";
}
