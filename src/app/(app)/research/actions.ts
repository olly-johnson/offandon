"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addCompetitor,
  CompetitorLimitError,
  DuplicateCompetitorError,
  getAnalysisForCompetitorMedia,
  getCompetitorForUser,
  getCompetitorMediaForUser,
  InvalidCompetitorHandleError,
  isCompetitorPlatform,
  markCompetitorMediaAnalysisPending,
  removeCompetitor,
  removeFromVault,
  saveToVault,
  setCompetitorMediaAnalysisFailure,
  updateCompetitorSyncState,
} from "@/engines/competitor";
import { OutlierIdeaGenerator } from "@/engines/content";
import { saveIdea } from "@/engines/content/ideas-persistence";
import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import {
  listRulesForSlicePrompt,
  loadMethodologySlice,
} from "@/engines/master-bot/persistence";
import { getUserMethodology } from "@/engines/methodology/persistence";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { SlopError } from "@/lib/shared/anti-slop";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { SUPPORTED_TRACKING_PLATFORMS } from "./suggested-creators";

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
  const platformRaw = (form.get("platform") ?? "instagram").toString();
  // Only accept platforms we currently surface for tracking. YouTube
  // Shorts is a valid CompetitorPlatform in the DB domain but disabled
  // on the surface, so a stale or crafted post falls back to instagram.
  const platform =
    isCompetitorPlatform(platformRaw) &&
    SUPPORTED_TRACKING_PLATFORMS.has(platformRaw)
      ? platformRaw
      : "instagram";

  let added;
  try {
    added = await addCompetitor(supabase, {
      userId: user.id,
      rawHandle: raw,
      platform,
    });
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

  // Kick off the initial scrape inline so the user sees the latest 5
  // reels analyse without an extra click. addCompetitor already set
  // sync_pending=true so the row renders "Syncing..." immediately.
  try {
    await inngest.send({
      name: INNGEST_EVENTS.CompetitorScrapeRequested,
      data: { competitor_id: added.id, user_id: user.id },
    });
    log.info("competitor added + initial sync queued", {
      user_id: user.id,
      competitor_id: added.id,
    });
  } catch (err) {
    log.error("addCompetitorAction: initial sync emit failed", {
      user_id: user.id,
      competitor_id: added.id,
      message: err instanceof Error ? err.message : String(err),
    });
    // Non-fatal: the row exists and the user can click the refresh
    // icon to retry. Don't bounce them back to a failed-add error.
  }

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

  // Some platforms (YouTube Shorts today) don't ship a directly-
  // downloadable media URL through the scraper, only the watch
  // page. Deepgram would 4xx on an HTML body. Stamp a friendly
  // failure reason here so the UI shows it as "Failed: ..." instead
  // of burning a Deepgram call.
  if (!media.media_url) {
    log.info("analyzeCompetitorMediaAction: media_url null, marking unsupported", {
      user_id: user.id,
      media_id: mediaId,
    });
    await setCompetitorMediaAnalysisFailure(admin, {
      mediaId,
      reason:
        "Direct media URL not available for this platform yet. Transcription needs a video extractor.",
    });
    revalidatePath(`/research/${media.competitor_id}`);
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

/**
 * Step 4 / Research Vault: pin a competitor reel's analysis as a
 * past_script reference. Same client_assets table the existing
 * /scripts wizard already reads, so saving here automatically
 * makes the reel available to script generation in the user's
 * voice. Source_file 'competitor:<media_id>' keeps the row idem-
 * potent and grep-able.
 */
export type VaultActionState = { error?: string; saved?: boolean };

export async function saveCompetitorToVaultAction(
  _prev: VaultActionState,
  form: FormData,
): Promise<VaultActionState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const mediaId = (form.get("media_id") ?? "").toString();
  if (!mediaId) return { error: "Missing media id." };

  const media = await getCompetitorMediaForUser(supabase, {
    userId: user.id,
    mediaId,
  });
  if (!media) return { error: "Reel not found." };

  const competitor = await getCompetitorForUser(supabase, {
    userId: user.id,
    id: media.competitor_id,
  });
  if (!competitor) return { error: "Competitor not found." };

  const analysis = await getAnalysisForCompetitorMedia(supabase, mediaId);
  if (!analysis) {
    return { error: "Run an analysis first, then save to the vault." };
  }

  const admin = createSupabaseAdminClient();
  try {
    await saveToVault(admin, {
      userId: user.id,
      competitor: { id: competitor.id, username: competitor.username },
      media: {
        id: media.id,
        permalink: media.permalink,
        posted_at: media.posted_at,
        view_count: media.view_count,
        like_count: media.like_count,
        comments_count: media.comments_count,
      },
      analysis,
    });
  } catch (err) {
    log.error("saveCompetitorToVaultAction failed", {
      user_id: user.id,
      media_id: mediaId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not save to vault. Try again." };
  }

  revalidatePath(`/research/${competitor.id}/${mediaId}`);
  revalidatePath("/research");
  return { saved: true };
}

export async function removeFromVaultAction(form: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const mediaId = (form.get("media_id") ?? "").toString();
  if (!mediaId) return;

  const admin = createSupabaseAdminClient();
  try {
    await removeFromVault(admin, { userId: user.id, mediaId });
    log.info("removed from vault", { user_id: user.id, media_id: mediaId });
  } catch (err) {
    log.error("removeFromVaultAction failed", {
      user_id: user.id,
      media_id: mediaId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath("/research");
}

/**
 * Step 4 / "Make my version": turn one saved outlier reel into 3 ideas
 * in the creator's own voice, about their own stories, mirroring the
 * outlier's hook/topic/structure pattern (never its content). The ideas
 * land in the Ideas Bank (source='research') so the user can develop
 * them into scripts in the existing /scripts flow. Runs inline like the
 * Script Wizard generators.
 */
export type GenerateIdeasState = { ok?: boolean; count?: number; error?: string };

const OUTLIER_IDEAS_PER_REEL = 3;

export async function generateIdeasFromOutlierAction(
  _prev: GenerateIdeasState,
  form: FormData,
): Promise<GenerateIdeasState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const mediaId = (form.get("media_id") ?? "").toString();
  if (!mediaId) return { error: "Missing media id." };

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) {
    return { error: "Complete onboarding first so we can write in your voice." };
  }

  const media = await getCompetitorMediaForUser(supabase, {
    userId: user.id,
    mediaId,
  });
  if (!media) return { error: "Reel not found." };

  const analysis = await getAnalysisForCompetitorMedia(supabase, mediaId);
  if (!analysis) {
    return { error: "Analyse this reel first, then generate ideas." };
  }

  const competitor = await getCompetitorForUser(supabase, {
    userId: user.id,
    id: media.competitor_id,
  });

  const admin = createSupabaseAdminClient();
  const [userMethodology, house, scriptsSlice, operatorRules] = await Promise.all([
    getUserMethodology(supabase, user.id),
    loadMethodologySlice(admin, "house"),
    loadMethodologySlice(admin, "scripts"),
    listRulesForSlicePrompt(admin, "scripts"),
  ]);

  let ideaSet;
  try {
    const generator = new OutlierIdeaGenerator({
      llm: new AnthropicLLMClient({
        onUsage: buildUsageRecorder({ userId: user.id, surface: "script" }),
      }),
    });
    ideaSet = await generator.generate({
      voiceDna: dna,
      outlier: {
        source_username: competitor?.username ?? "a competitor",
        hook: analysis.hook,
        structure: analysis.structure,
        caption: media.caption,
        transcript: analysis.transcript,
        pillar_match: analysis.pillar_match,
      },
      count: OUTLIER_IDEAS_PER_REEL,
      userMethodology,
      methodologyContext: { house, scripts: scriptsSlice, operatorRules },
    });
  } catch (err) {
    log.error("generateIdeasFromOutlierAction generation failed", {
      user_id: user.id,
      media_id: mediaId,
      slop: err instanceof SlopError,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      error:
        err instanceof SlopError
          ? "The generated ideas failed the slop validator. Try again."
          : "Could not generate ideas. Try again.",
    };
  }

  try {
    for (const idea of ideaSet.ideas) {
      await saveIdea(admin, {
        userId: user.id,
        content: idea.content,
        source: "research",
        pillar: idea.pillar,
      });
    }
  } catch (err) {
    log.error("generateIdeasFromOutlierAction save failed", {
      user_id: user.id,
      media_id: mediaId,
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: "Generated ideas but could not save them. Try again." };
  }

  log.info("outlier ideas generated", {
    user_id: user.id,
    media_id: mediaId,
    count: ideaSet.ideas.length,
  });
  // The Ideas Bank lives under /scripts; refresh both surfaces.
  revalidatePath("/scripts");
  revalidatePath("/research");
  return { ok: true, count: ideaSet.ideas.length };
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
