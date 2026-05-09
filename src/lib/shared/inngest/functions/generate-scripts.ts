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
 * On any thrown error, the function catches and writes status='failed' with
 * a truncated failure_reason before rethrowing so Inngest still records the
 * failure and retries-by-default behaviour kicks in (configurable per
 * function; we leave defaults for MVP).
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

    // Mark running so the UI shows 'Generating...' instead of 'Pending'.
    await step.run("mark-running", async () => {
      await updateBatchStatus(supabase, batch_id, { status: "running" });
      log.info("batch running", { batch_id, user_id });
    });

    try {
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

      const batch = await step.run("generate", async () => {
        const generator = new ScriptGenerator({ llm: new AnthropicLLMClient() });
        const result = await generator.generate({ voiceDna: dna, count });
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
      await step.run("mark-failed", async () => {
        await updateBatchStatus(supabase, batch_id, {
          status: "failed",
          failure_reason: reason,
          completed_at: new Date().toISOString(),
        });
      });
      throw err;
    }
  },
);
