"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addCompetitor,
  CompetitorLimitError,
  DuplicateCompetitorError,
  getCompetitorMediaForUser,
  InvalidCompetitorHandleError,
  markCompetitorMediaAnalysisPending,
  removeCompetitor,
  updateCompetitorSyncState,
} from "@/engines/competitor";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("research.actions");

export type AddCompetitorState = { error?: string; ok?: boolean };

export async function addCompetitorAction(
  _prev: AddCompetitorState,
  form: FormData,
): Promise<AddCompetitorState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const raw = (form.get("handle") ?? "").toString();

  try {
    await addCompetitor(supabase, { userId: user.id, rawHandle: raw });
  } catch (err) {
    if (
      err instanceof InvalidCompetitorHandleError ||
      err instanceof DuplicateCompetitorError ||
      err instanceof CompetitorLimitError
    ) {
      return { error: err.message };
    }
    log.error("addCompetitorAction failed", {
      user_id: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not add competitor. Try again." };
  }

  log.info("competitor added", { user_id: user.id });
  revalidatePath("/research");
  return { ok: true };
}

/**
 * "Sync now" trigger. The action emits the Inngest event; the heavy
 * lifting (Apify run + dataset ingest) happens in the background. We
 * also stamp last_synced_at = null + last_sync_error = null up-front so
 * the UI badge immediately reads "Syncing..." even before the event is
 * picked up.
 */
export async function syncCompetitorAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  const admin = createSupabaseAdminClient();
  try {
    await updateCompetitorSyncState(admin, {
      competitorId: id,
      userId: user.id,
      lastSyncedAt: null,
      lastSyncError: null,
      syncPending: true,
    });
    await inngest.send({
      name: INNGEST_EVENTS.CompetitorScrapeRequested,
      data: { competitor_id: id, user_id: user.id },
    });
    log.info("competitor sync requested", { user_id: user.id, id });
  } catch (err) {
    log.error("syncCompetitorAction failed", {
      user_id: user.id,
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath("/research");
}

/**
 * Manual per-reel analysis trigger. Used by the drill-in page so the
 * user can analyze older reels (anything beyond the latest 5 that get
 * auto-analyzed on sync) or retry a previously-failed analysis.
 * Clears the failure reason up-front so the UI can flip from
 * "Failed: ..." to "Analyzing..." immediately.
 */
export async function analyzeCompetitorMediaAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const mediaId = (formData.get("media_id") ?? "").toString();
  if (!mediaId) return;

  const admin = createSupabaseAdminClient();
  // Ownership check + grab competitor_id for the event payload. RLS
  // would already block writes for the wrong user, but verifying here
  // gives us a cleaner failure mode and the FK ids we need.
  const media = await getCompetitorMediaForUser(admin, {
    userId: user.id,
    mediaId,
  });
  if (!media) {
    log.warn("analyzeCompetitorMediaAction: media not found for user", {
      user_id: user.id,
      media_id: mediaId,
    });
    return;
  }

  try {
    await markCompetitorMediaAnalysisPending(admin, { mediaIds: [mediaId] });
    await inngest.send({
      name: INNGEST_EVENTS.CompetitorMediaAnalyzeRequested,
      data: {
        user_id: user.id,
        competitor_id: media.competitor_id,
        media_id: mediaId,
        force: true,
      },
    });
    log.info("competitor media analyze requested", {
      user_id: user.id,
      media_id: mediaId,
    });
  } catch (err) {
    log.error("analyzeCompetitorMediaAction failed", {
      user_id: user.id,
      media_id: mediaId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath(`/research/${media.competitor_id}`);
}

export async function removeCompetitorAction(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") ?? "").toString();
  if (!id) return;

  try {
    await removeCompetitor(supabase, { userId: user.id, id });
    log.info("competitor removed", { user_id: user.id, id });
  } catch (err) {
    log.error("removeCompetitorAction failed", {
      user_id: user.id,
      id,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath("/research");
}
