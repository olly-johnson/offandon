import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { ScriptGenerator } from "@/engines/content/script-generator";
import {
  saveGeneratedScripts,
  updateBatchStatus,
} from "@/engines/content/persistence";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import type { VoiceDNA } from "@/engines/voice/types";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  INNGEST_EVENTS,
  inngest,
  type ScriptsBatchRequestedData,
} from "../client";

const log = createLogger("inngest.generate-scripts");

/**
 * Background worker that fulfills a script_batches row.
 *
 * Lifecycle inside one invocation:
 *   1. Mark batch 'running'
 *   2. Load voice_dna_snapshot + count_requested from the batch row
 *   3. Call ScriptGenerator (Anthropic claude-sonnet-4-6, ~15-25s)
 *   4. Insert scripts rows linked to batch_id
 *   5. Mark batch 'complete' with count_generated + completed_at
 *
 * On any thrown error, the function attempts to write status='failed' with
 * a truncated failure_reason and ALWAYS rethrows the original error. The
 * mark-failed write is best-effort: if it itself fails (db unreachable,
 * grant gap), we log loudly and swallow so the original error still
 * surfaces to Inngest. The batch row may then sit in pending/running until
 * cleared manually; a follow-up cron should sweep stuck batches > N min.
 *
 * Uses the SERVICE-ROLE Supabase client because there is no end-user JWT
 * in this context. The function trusts event.data.user_id because Inngest
 * verifies inbound events via INNGEST_SIGNING_KEY at the serve endpoint.
 */
export const generateScripts = inngest.createFunction(
  {
    id: "generate-scripts",
    name: "Generate scripts batch",
    triggers: [{ event: INNGEST_EVENTS.ScriptsBatchRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as ScriptsBatchRequestedData;
    const { batch_id, user_id } = data;

    if (!batch_id || !user_id) {
      log.error("event missing required fields", { has_batch: !!batch_id, has_user: !!user_id });
      throw new Error("scripts/batch.requested event missing batch_id or user_id");
    }

    const supabase = createSupabaseAdminClient();

    try {
      // Mark running so the UI shows 'Generating...' instead of 'Pending'.
      // Inside the try so a mark-running failure also lands in the
      // mark-failed path; otherwise the batch sits as 'pending' forever.
      await step.run("mark-running", async () => {
        await updateBatchStatus(supabase, batch_id, { status: "running" });
        log.info("batch running", { batch_id, user_id });
      });

      const { dna, count } = await step.run("load-batch", async () => {
        const { data: row, error } = await supabase
          .from("script_batches")
          .select("voice_dna_snapshot, count_requested")
          .eq("id", batch_id)
          .single();
        if (error || !row) {
          throw new Error(`load-batch: ${error?.message ?? "not found"}`);
        }
        return {
          dna: row.voice_dna_snapshot as unknown as VoiceDNA,
          count: row.count_requested,
        };
      });

      const userMethodology = await step.run("load-user-methodology", async () => {
        const { getUserMethodology } = await import(
          "@/engines/methodology/persistence"
        );
        return getUserMethodology(supabase, user_id);
      });

      const clientAssets = await step.run("load-client-assets", async () => {
        const { loadScriptAssetsContext } = await import(
          "@/engines/content/client-assets-persistence"
        );
        return loadScriptAssetsContext(supabase, user_id);
      });

      // Implicit corpus retrieval (BO-051). Grounds the batch in recent
      // Fathom transcripts / questionnaires / notes. When VOYAGE_API_KEY
      // is unset (dev environments without embeddings), the step returns
      // null and the generator behaves exactly as it did pre-BO-051.
      const corpusContext = await step.run("load-corpus-context", async () => {
        const apiKey = process.env.VOYAGE_API_KEY;
        if (!apiKey) {
          log.warn("VOYAGE_API_KEY unset, skipping corpus retrieval", {
            batch_id,
            user_id,
          });
          return null;
        }
        const { VoyageEmbeddingsClient } = await import(
          "@/lib/shared/embeddings"
        );
        const { loadScriptsCorpusContext } = await import(
          "@/engines/content/corpus-context"
        );
        const embeddings = new VoyageEmbeddingsClient({ apiKey });
        try {
          return await loadScriptsCorpusContext(
            { supabase, embeddings },
            { userId: user_id, voiceDna: dna },
          );
        } catch (err) {
          // Retrieval failures must not block batch generation. The
          // batch is still valuable without corpus grounding; we just
          // lose the recency boost. Logged so we can spot Voyage
          // outages or RPC regressions.
          log.warn("corpus retrieval failed, continuing without it", {
            batch_id,
            user_id,
            error: err instanceof Error ? err.message : String(err),
          });
          return null;
        }
      });

      const methodologyContext = await step.run("load-methodology", async () => {
        const { loadMethodologySlice, listRulesForSlicePrompt } = await import(
          "@/engines/master-bot/persistence"
        );
        const [house, scripts, operatorRules] = await Promise.all([
          loadMethodologySlice(supabase, "house"),
          loadMethodologySlice(supabase, "scripts"),
          listRulesForSlicePrompt(supabase, "scripts"),
        ]);
        return { house, scripts, operatorRules };
      });

      const batch = await step.run("generate", async () => {
        const generator = new ScriptGenerator({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user_id, surface: "script" }),
          }),
        });
        const result = await generator.generate({
          voiceDna: dna,
          count,
          userMethodology,
          clientAssets,
          corpusContext,
          methodologyContext,
        });
        log.info("generation ok", {
          batch_id,
          requested: result.meta.requested_count,
          actual: result.meta.actual_count,
        });
        return result;
      });

      await step.run("save-scripts", async () => {
        await saveGeneratedScripts(supabase, {
          batchId: batch_id,
          userId: user_id,
          scripts: batch.scripts,
          voiceDnaSnapshot: dna,
        });
      });

      await step.run("mark-complete", async () => {
        await updateBatchStatus(supabase, batch_id, {
          status: "complete",
          count_generated: batch.scripts.length,
          completed_at: new Date().toISOString(),
        });
        log.info("batch complete", { batch_id, count: batch.scripts.length });
      });

      return { batch_id, count: batch.scripts.length };
    } catch (err) {
      const reason = (err as Error).message.slice(0, 500);
      log.error("batch failed", { batch_id, user_id, reason });

      // Mark-failed must NEVER reject and shadow the original error.
      // If updateBatchStatus itself blows up (e.g. service_role grant gap,
      // db unreachable), the batch row stays in pending/running and the
      // user is permanently stuck. Catch separately, log, swallow.
      try {
        await step.run("mark-failed", async () => {
          await updateBatchStatus(supabase, batch_id, {
            status: "failed",
            failure_reason: reason,
            completed_at: new Date().toISOString(),
          });
        });
      } catch (markErr) {
        log.error("mark-failed itself failed; batch may be stuck until manually cleared", {
          batch_id,
          user_id,
          original_error: reason,
          mark_failed_error: (markErr as Error).message,
        });
      }

      // Always rethrow the ORIGINAL error so Inngest records the true cause.
      throw err;
    }
  },
);
