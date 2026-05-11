"use server";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { InstagramClient, InstagramTokenError } from "@/engines/instagram/client";
import {
  deleteConnection,
  getConnection,
} from "@/engines/instagram/persistence";
import { runInstagramSync } from "@/engines/instagram/sync";
import {
  buildAuthorizeUrl,
  loadOAuthConfig,
} from "@/engines/instagram/oauth";
import { OAUTH_STATE_COOKIE } from "@/app/api/auth/instagram/callback/route";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("library.actions");

/**
 * Primary connect path: kick off Instagram OAuth.
 *
 * Generates a random `state` token, sets it on a short-lived httpOnly
 * cookie, then redirects the user to Instagram's authorize URL. When
 * Instagram redirects back to /api/auth/instagram/callback, the route
 * verifies the cookie matches the returned state to defend against
 * CSRF and cross-site code relay.
 *
 * Falls back to a friendly error redirect if the server is missing
 * IG_APP_ID / IG_APP_SECRET / IG_OAUTH_REDIRECT_URI env vars; we surface
 * this on /library rather than crashing the action.
 */
export async function startInstagramOAuthAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  let config;
  try {
    config = loadOAuthConfig();
  } catch {
    redirect(
      `/library?ig_error=${encodeURIComponent(
        "Server is not configured for Instagram OAuth. Contact support.",
      )}`,
    );
  }

  const state = randomBytes(32).toString("hex");
  const cookieJar = await cookies();
  cookieJar.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes; matches IG's auth code TTL.
  });

  redirect(buildAuthorizeUrl({ config, state }));
}

export type ConnectState = { error?: string; ok?: boolean };

/**
 * Connect Instagram with a user-supplied long-lived access token.
 * Validates the token immediately by calling /me; persists the
 * connection + runs an initial media sync inline so the user lands
 * straight on a populated grid.
 */
export async function connectInstagramAction(
  _prev: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  void _prev;
  const token = (form.get("access_token") ?? "").toString().trim();
  if (token.length < 20) {
    return { error: "Paste a valid Instagram long-lived access token." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const client = new InstagramClient();
  const result = await runInstagramSync({
    supabase,
    client,
    userId: user.id,
    accessToken: token,
  });

  if (!result.ok) {
    log.warn("instagram connect: initial sync failed", {
      user_id: user.id,
      error: result.error,
    });
    return {
      error:
        result.error?.toLowerCase().includes("token") ||
        result.error?.includes("401") ||
        result.error?.includes("403")
          ? "Instagram rejected that token. Generate a fresh long-lived token in your Meta dashboard."
          : `Could not connect: ${result.error}`,
    };
  }

  log.info("instagram connected", {
    user_id: user.id,
    media_count: result.mediaCount,
    followers: result.followersCount,
  });
  revalidatePath("/library");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type RefreshState = { error?: string };

/**
 * Manual refresh. Always pulls fresh from Instagram regardless of when
 * the last sync ran. The 24h cache window is for the nightly Inngest
 * cron, not the user clicking the button. They're hitting Refresh
 * because they want new data NOW.
 */
export async function refreshInstagramAction(): Promise<RefreshState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const conn = await getConnection(supabase, user.id);
  if (!conn) {
    return { error: "Instagram is not connected." };
  }

  const client = new InstagramClient();
  const result = await runInstagramSync({
    supabase,
    client,
    userId: user.id,
    accessToken: conn.access_token,
  });
  if (!result.ok) {
    return {
      error: result.error?.toLowerCase().includes("token")
        ? "Token rejected. Reconnect with a fresh token."
        : `Refresh failed: ${result.error ?? "unknown"}`,
    };
  }
  revalidatePath("/library");
  revalidatePath("/dashboard");
  return {};
}

export type DisconnectState = { error?: string; ok?: boolean };

export async function disconnectInstagramAction(): Promise<DisconnectState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  try {
    await deleteConnection(supabase, user.id);
    log.info("instagram disconnected", { user_id: user.id });
  } catch (err) {
    return {
      error: `Could not disconnect: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
  revalidatePath("/library");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Re-export so the UI can do an instanceof check without pulling from engine.
export { InstagramTokenError };
