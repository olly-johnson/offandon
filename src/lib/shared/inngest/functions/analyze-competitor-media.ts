import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import {
  getAnalysisForCompetitorMedia,
  saveCompetitorAnalysis,
} from "@/engines/competitor/analysis-persistence";
import { setCompetitorMediaAnalysisFailure } from "@/engines/competitor/media-persistence";
import {
  computeLibraryStats,
  DeepgramTranscriptionClient,
  enforceAnalysisRateLimit,
  MediaAnalyzer,
  ResearchRateLimitError,
} from "@/engines/research";
import { RESEARCH_ANALYSIS_MODEL } from "@/engines/research/system-prompt";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import type { VoiceDNA } from "@/engines/voice/types";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  INNGEST_EVENTS,
  inngest,
  type CompetitorMediaAnalyzeRequestedData,
} from "../client";

const log = createLogger("inngest.analyze-competitor-media");

/**
 * Per-reel analysis for tracked competitors. Mirrors analyzeMedia
 * (BO-043) but reads from competitor_media and writes to
 * competitor_media_analysis. Two material differences from the
 * user-library version:
 *   - Library stats are computed from the *competitor's* own reel
 *     view-counts, not the user's reach distribution. "top" means
 *     "top within this competitor's reel library".
 *   - Voice DNA still comes from the user — we want pillar_match to
 *     answer "does this fit the user's pillars" so the drill-in page
 *     can highlight relevance.
 *
 * Operator kill switch: RESEARCH_ANALYSIS_DISABLED=1 (shared with the
 * /library analyzer) shuts both surfaces down at the door.
 */
export const analyzeCompetitorMedia = inngest.createFunction(
  {
    id: "analyze-competitor-media",
    name: "Analyze competitor reel",
    triggers: [{ event: INNGEST_EVENTS.CompetitorMediaAnalyzeRequested }],
    // Rate-limit concurrency at the function level so a 30-reel fan-out
    // doesn't slam Deepgram + Anthropic. Inngest's concurrency limit is
    // per-function across runs.
    concurrency: { limit: 4 },
  },
  async ({ event, step }) => {
    const data = event.data as CompetitorMediaAnalyzeRequestedData;
    const { user_id, competitor_id, media_id, force } = data;
    if (!user_id || !competitor_id || !media_id) {
      throw new Error(
        "competitor/media.analyze.requested missing user_id, competitor_id, or media_id",
      );
    }

    if (process.env.RESEARCH_ANALYSIS_DISABLED === "1") {
      log.warn(
        "analyze-competitor-media short-circuited by RESEARCH_ANALYSIS_DISABLED=1",
        { user_id, competitor_id, media_id },
      );
      return { skipped: "disabled" };
    }

    const supabase = createSupabaseAdminClient();

    try {

    const [mediaRow, dna] = await Promise.all([
      step.run("load-media", async () => {
        const { data: row, error } = await supabase
          .from("competitor_media")
          .select(
            "id, competitor_id, user_id, media_type, caption, media_url, posted_at, view_count, like_count, comments_count",
          )
          .eq("id", media_id)
          .eq("competitor_id", competitor_id)
          .eq("user_id", user_id)
          .single();
        if (error || !row) {
          throw new Error(`load-media: ${error?.message ?? "not found"}`);
        }
        if (!row.media_url) {
          throw new Error("load-media: reel has no media_url to download");
        }
        return row;
      }),
      step.run("load-voice-dna", async () => {
        const v = await getCurrentVoiceDNA(supabase, user_id);
        if (!v) throw new Error("load-voice-dna: user has no active voice_dna row");
        return v as VoiceDNA;
      }),
    ]);

    if (!force) {
      const cached = await step.run("check-cached-analysis", async () => {
        const row = await getAnalysisForCompetitorMedia(supabase, media_id);
        return row !== null;
      });
      if (cached) {
        log.info("analyze-competitor-media short-circuited (cached)", {
          user_id,
          competitor_id,
          media_id,
        });
        return { skipped: "cached" };
      }
    }

    await step.run("rate-limit", async () => {
      try {
        const { used, limit } = await enforceAnalysisRateLimit({
          supabase,
          userId: user_id,
        });
        log.info("rate-limit ok", { user_id, used, limit });
      } catch (err) {
        if (err instanceof ResearchRateLimitError) {
          log.warn("rate-limit blocked analyze-competitor-media", {
            user_id,
            competitor_id,
            media_id,
            used: err.used,
            limit: err.limit,
          });
        }
        throw err;
      }
    });

    // Combine download + transcribe into one step — Uint8Array doesn't
    // survive Inngest's between-step serialization (lands as {0: byte}
    // object). Same workaround as analyze-media.
    const transcript = await step.run("download-and-transcribe", async () => {
      const res = await fetch(mediaRow.media_url as string);
      if (!res.ok) {
        throw new Error(`download-audio: HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      log.debug("audio downloaded", { media_id, bytes: buf.byteLength });

      const client = new DeepgramTranscriptionClient();
      const result = await client.transcribe(new Uint8Array(buf));
      return { text: result.text, model: client.modelId };
    });

    const libraryStats = await step.run("library-stats", async () => {
      // Library context for a competitor reel = the competitor's own
      // reel view-count distribution. Apify gives us view_count
      // (videoPlayCount) reliably; reach isn't surfaced for accounts
      // we don't own.
      const { data: rows, error } = await supabase
        .from("competitor_media")
        .select("view_count")
        .eq("competitor_id", competitor_id);
      if (error) throw new Error(`library-stats: ${error.message}`);
      return computeLibraryStats((rows ?? []).map((r) => r.view_count));
    });

    const analysis = await step.run("analyze", async () => {
      const analyzer = new MediaAnalyzer({
        llm: new AnthropicLLMClient({
          model: RESEARCH_ANALYSIS_MODEL,
          onUsage: buildUsageRecorder({
            userId: user_id,
            surface: "competitor_analysis",
          }),
        }),
      });
      return analyzer.analyze({
        voiceDna: dna,
        libraryStats,
        media: {
          caption: mediaRow.caption,
          // Map the competitor's view_count into the "reach" slot the
          // analyzer expects — the percentile bucketing logic works on
          // whichever consistent metric we feed it.
          reach: mediaRow.view_count,
          plays: mediaRow.view_count,
          like_count: mediaRow.like_count,
          comments_count: mediaRow.comments_count,
          saved: null,
          shares: null,
          posted_at: mediaRow.posted_at,
        },
        transcript: transcript.text,
      });
    });

    await step.run("save", async () => {
      await saveCompetitorAnalysis(supabase, {
        mediaId: media_id,
        competitorId: competitor_id,
        userId: user_id,
        analysis,
        llmModel: RESEARCH_ANALYSIS_MODEL,
        transcriptModel: transcript.model,
      });
      // Clear any prior failure reason now that we have a fresh
      // successful analysis on this reel.
      await setCompetitorMediaAnalysisFailure(supabase, {
        mediaId: media_id,
        reason: null,
      });
      log.info("competitor analysis saved", {
        media_id,
        competitor_id,
        user_id,
        performance_score: analysis.performance_score,
        pillar_match: analysis.pillar_match,
      });
    });

    return {
      media_id,
      competitor_id,
      user_id,
      performance_score: analysis.performance_score,
    };

    } catch (err) {
      // Anywhere in the pipeline above can throw — Deepgram failure,
      // missing voice_dna, rate-limit hit, Sonnet timeout. Without
      // this catch, no analysis row lands and the UI spinner spins
      // forever. Surface the reason on competitor_media so the tile
      // can render "Failed: <reason>" with a retry button, then
      // re-throw so Inngest marks the run failed and retries kick in.
      const message = err instanceof Error ? err.message : String(err);
      await step.run("record-failure", async () => {
        await setCompetitorMediaAnalysisFailure(supabase, {
          mediaId: media_id,
          reason: message,
        });
      });
      throw err;
    }
  },
);
