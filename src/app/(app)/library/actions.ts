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

// ---------------------------------------------------------------------------
// BO-043: Instagram video analysis
// ---------------------------------------------------------------------------

import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import {
  enforceAnalysisRateLimit,
  getAnalysisForMedia,
  ResearchRateLimitError,
} from "@/engines/research";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

export type AnalyzeMediaState = { error?: string; queued?: boolean };

/**
 * Enqueue an Inngest analyze-media job for one video. Cheap, sync:
 * does an ownership + rate-limit check, then emits the event. The
 * heavy lifting (download, transcribe, LLM) lives in the function.
 *
 * Rate-limit check here is a soft pre-flight; the Inngest function
 * re-runs it inside the actual step to defend against races. Both
 * use the service-role client because the limit table has no
 * authenticated grants.
 */
export async function requestMediaAnalysis(
  mediaId: string,
): Promise<AnalyzeMediaState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  if (!mediaId) return { error: "Missing media id." };

  if (process.env.RESEARCH_ANALYSIS_DISABLED === "1") {
    return { error: "Video analysis is temporarily disabled." };
  }

  // Ownership check via the user JWT (RLS keeps this honest).
  const { data: media, error: mediaErr } = await supabase
    .from("instagram_media")
    .select("id, media_type")
    .eq("id", mediaId)
    .maybeSingle();
  if (mediaErr) {
    log.error("requestMediaAnalysis media lookup failed", {
      user_id: user.id,
      media_id: mediaId,
      message: mediaErr.message,
    });
    return { error: "Could not look up that video." };
  }
  if (!media) return { error: "Video not found." };
  if (media.media_type !== "VIDEO" && media.media_type !== "REELS") {
    return { error: "Only videos and reels can be analyzed." };
  }

  // Rate-limit pre-flight via service-role.
  const adminClient = createSupabaseAdminClient();
  try {
    await enforceAnalysisRateLimit({
      supabase: adminClient,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ResearchRateLimitError) {
      return {
        error: `Monthly analysis limit reached (${err.used}/${err.limit}). Try again later in the month.`,
      };
    }
    return {
      error: `Could not check rate limit: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }

  await inngest.send({
    name: INNGEST_EVENTS.MediaAnalyzeRequested,
    data: { user_id: user.id, media_id: mediaId },
  });

  log.info("media analysis enqueued", { user_id: user.id, media_id: mediaId });
  revalidatePath("/library");
  return { queued: true };
}

/**
 * Promote an analyzed video to a client_assets[past_script] row so the
 * script generator references it on future runs (BO-042 wiring). Called
 * after the user clicks "Save as reference" on the analysis panel.
 *
 * Idempotent on (user_id, source_file) via the existing client_assets
 * unique index. source_file format: "instagram:<media_id>".
 */
export type SaveReferenceState = { error?: string; saved?: boolean };

export async function saveAnalysisAsReference(
  mediaId: string,
): Promise<SaveReferenceState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  if (!mediaId) return { error: "Missing media id." };

  // Pull the analysis (RLS-scoped) so the user can only reference their own.
  const analysis = await getAnalysisForMedia(supabase, mediaId);
  if (!analysis) {
    return { error: "No analysis to save. Run Analyze first." };
  }

  const { data: media } = await supabase
    .from("instagram_media")
    .select("permalink, posted_at, reach, plays")
    .eq("id", mediaId)
    .maybeSingle();

  const title = analysis.hook?.slice(0, 80) ?? "Past reference";
  const bodyLines = [
    analysis.transcript,
    "",
    analysis.what_worked ? `What worked: ${analysis.what_worked}` : null,
    analysis.what_to_repeat ? `Repeat: ${analysis.what_to_repeat}` : null,
  ].filter((s): s is string => !!s);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("client_assets").upsert(
    {
      user_id: user.id,
      asset_type: "past_script" as const,
      title,
      body: bodyLines.join("\n"),
      metadata: {
        source: "instagram",
        media_id: mediaId,
        permalink: media?.permalink ?? null,
        posted_at: media?.posted_at ?? null,
        reach: media?.reach ?? null,
        plays: media?.plays ?? null,
        hook: analysis.hook,
        structure: analysis.structure,
        pillar_match: analysis.pillar_match,
        performance_label: analysis.performance_label,
      },
      source_file: `instagram:${mediaId}`,
    },
    { onConflict: "user_id,source_file" },
  );
  if (error) {
    log.error("saveAnalysisAsReference upsert failed", {
      user_id: user.id,
      media_id: mediaId,
      message: error.message,
    });
    return { error: "Could not save as reference. Try again." };
  }
  log.info("analysis saved as past_script reference", {
    user_id: user.id,
    media_id: mediaId,
  });
  revalidatePath("/library");
  return { saved: true };
}
