"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { InstagramClient, InstagramTokenError } from "@/engines/instagram/client";
import {
  deleteConnection,
  getConnection,
  isConnectionFresh,
} from "@/engines/instagram/persistence";
import { runInstagramSync } from "@/engines/instagram/sync";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("library.actions");

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

export type RefreshState = { error?: string; cached?: boolean };

/**
 * Manual refresh. Enforces the 24h cache: if last_synced_at is within
 * the window we return { cached: true } without hitting IG. Otherwise
 * we run the sync.
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

  if (isConnectionFresh(conn.last_synced_at, new Date())) {
    return { cached: true };
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
