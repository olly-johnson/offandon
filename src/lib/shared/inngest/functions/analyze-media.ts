import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import type { VoiceDNA } from "@/engines/voice/types";
import {
  computeLibraryStats,
  DeepgramTranscriptionClient,
  enforceAnalysisRateLimit,
  MediaAnalyzer,
  saveAnalysis,
  ResearchRateLimitError,
} from "@/engines/research";
import { RESEARCH_ANALYSIS_MODEL } from "@/engines/research/system-prompt";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  INNGEST_EVENTS,
  inngest,
  type MediaAnalyzeRequestedData,
} from "../client";

const log = createLogger("inngest.analyze-media");

/**
 * Background worker that produces one instagram_media_analysis row.
 *
 * Lifecycle inside one invocation:
 *   1. Load media row + voice_dna (parallel)
 *   2. Rate-limit check (rolling 30d)
 *   3. Short-circuit if analysis already exists and force=false
 *   4. Download MP4 from media_url
 *   5. Deepgram transcribe
 *   6. Compute library stats for the user
 *   7. Sonnet structural analysis
 *   8. Upsert instagram_media_analysis + research_analysis_runs
 *
 * The function is killed at the door by RESEARCH_ANALYSIS_DISABLED=1.
 * Use that as the operator ejector if Deepgram or Anthropic spend
 * needs to be cut.
 *
 * Like generate-scripts, this uses the service-role Supabase client
 * because the worker has no end-user JWT.
 */
export const analyzeMedia = inngest.createFunction(
  {
    id: "analyze-media",
    name: "Analyze Instagram media",
    triggers: [{ event: INNGEST_EVENTS.MediaAnalyzeRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as MediaAnalyzeRequestedData;
    const { user_id, media_id, force } = data;
    if (!user_id || !media_id) {
      throw new Error(
        "research/media.analyze.requested event missing user_id or media_id",
      );
    }

    if (process.env.RESEARCH_ANALYSIS_DISABLED === "1") {
      log.warn("analyze-media short-circuited by RESEARCH_ANALYSIS_DISABLED=1", {
        user_id,
        media_id,
      });
      return { skipped: "disabled" };
    }

    const supabase = createSupabaseAdminClient();

    const [mediaRow, dna] = await Promise.all([
      step.run("load-media", async () => {
        const { data: row, error } = await supabase
          .from("instagram_media")
          .select("id, user_id, media_type, caption, media_url, posted_at, reach, plays, like_count, comments_count, saved, shares")
          .eq("id", media_id)
          .eq("user_id", user_id)
          .single();
        if (error || !row) {
          throw new Error(`load-media: ${error?.message ?? "not found"}`);
        }
        if (!row.media_url) {
          throw new Error("load-media: media has no media_url to download");
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
        const { data: row, error } = await supabase
          .from("instagram_media_analysis")
          .select("media_id")
          .eq("media_id", media_id)
          .maybeSingle();
        if (error) throw new Error(`check-cached-analysis: ${error.message}`);
        return !!row;
      });
      if (cached) {
        log.info("analyze-media short-circuited (cached)", { user_id, media_id });
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
          log.warn("rate-limit blocked analyze-media", {
            user_id,
            media_id,
            used: err.used,
            limit: err.limit,
          });
        }
        throw err;
      }
    });

    // Combine download + transcribe into one step. Inngest serializes
    // step return values for durability across retries; Uint8Array
    // doesn't survive that round-trip (lands as a {0: byte, 1: byte}
    // object). Keeping the bytes in-memory inside one step avoids the
    // hop. Both halves are idempotent so retrying the combined step is
    // safe.
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
      const { data: rows, error } = await supabase
        .from("instagram_media")
        .select("reach")
        .eq("user_id", user_id);
      if (error) throw new Error(`library-stats: ${error.message}`);
      return computeLibraryStats((rows ?? []).map((r) => r.reach));
    });

    const analysis = await step.run("analyze", async () => {
      const analyzer = new MediaAnalyzer({
        llm: new AnthropicLLMClient({
          model: RESEARCH_ANALYSIS_MODEL,
          onUsage: buildUsageRecorder({ userId: user_id, surface: "media_analysis" }),
        }),
      });
      return analyzer.analyze({
        voiceDna: dna,
        libraryStats,
        media: {
          caption: mediaRow.caption,
          reach: mediaRow.reach,
          plays: mediaRow.plays,
          like_count: mediaRow.like_count,
          comments_count: mediaRow.comments_count,
          saved: mediaRow.saved,
          shares: mediaRow.shares,
          posted_at: mediaRow.posted_at,
        },
        transcript: transcript.text,
      });
    });

    await step.run("save", async () => {
      await saveAnalysis(supabase, {
        mediaId: media_id,
        userId: user_id,
        analysis,
        llmModel: RESEARCH_ANALYSIS_MODEL,
        transcriptModel: transcript.model,
      });
      log.info("analysis saved", {
        media_id,
        user_id,
        performance_label: analysis.performance_label,
        pillar_match: analysis.pillar_match,
      });
    });

    return {
      media_id,
      user_id,
      performance_label: analysis.performance_label,
    };
  },
);
