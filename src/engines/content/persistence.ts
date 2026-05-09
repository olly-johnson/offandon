import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database, Json } from "@/lib/shared/supabase";
import type { VoiceDNA } from "@/engines/voice/types";

import type { GeneratedScript } from "./types";

const log = createLogger("content.persistence");

/**
 * Convenience alias for downstream callers. They should not need to know
 * which Database schema this engine is bound to.
 */
export type ContentSupabaseClient = SupabaseClient<Database>;

/**
 * Persist a generated batch of scripts.
 *
 * Inserts:
 *   - One row per generated script into `scripts`, all linked to the batch
 *
 * Does NOT update `script_batches` status; that's the Inngest function's
 * responsibility (so it can mark complete only after this returns).
 *
 * Uses the supplied client as-is. The Inngest worker passes a service-role
 * client because it has no end-user JWT; a server action calling this from
 * a user context could pass a regular server client.
 */
export async function saveGeneratedScripts(
  supabase: ContentSupabaseClient,
  args: {
    batchId: string;
    userId: string;
    scripts: GeneratedScript[];
    voiceDnaSnapshot: VoiceDNA;
  },
): Promise<void> {
  const rows = args.scripts.map((s) => ({
    batch_id: args.batchId,
    user_id: args.userId,
    hook: s.hook,
    body: s.body,
    title: s.hook.length > 80 ? `${s.hook.slice(0, 77)}...` : s.hook,
    voice_dna_snapshot: args.voiceDnaSnapshot as unknown as Json,
    source: "generated" as const,
    status: "draft" as const,
  }));

  const { error } = await supabase.from("scripts").insert(rows);
  if (error) {
    log.error("scripts insert failed", {
      batch_id: args.batchId,
      user_id: args.userId,
      count: rows.length,
      code: error.code,
      message: error.message,
    });
    throw new Error(`saveGeneratedScripts: ${error.message}`);
  }

  log.debug("scripts inserted", { batch_id: args.batchId, count: rows.length });
}

/**
 * Create a new batch row in 'pending' status. Returns the new batch's id.
 * Identity is taken from the JWT context on the supplied client; the userId
 * arg must match auth.uid() or RLS will deny.
 */
export async function createScriptBatch(
  supabase: ContentSupabaseClient,
  args: {
    userId: string;
    voiceDnaSnapshot: VoiceDNA;
    countRequested: number;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("script_batches")
    .insert({
      user_id: args.userId,
      voice_dna_snapshot: args.voiceDnaSnapshot as unknown as Json,
      count_requested: args.countRequested,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error("script_batches insert failed", {
      user_id: args.userId,
      code: error?.code,
      message: error?.message,
    });
    throw new Error(`createScriptBatch: ${error?.message ?? "unknown"}`);
  }
  return data.id;
}

export interface BatchRow {
  id: string;
  status: "pending" | "running" | "complete" | "failed";
  count_requested: number;
  count_generated: number;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function listBatchesForUser(
  supabase: ContentSupabaseClient,
  userId: string,
  limit = 20,
): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from("script_batches")
    .select("id, status, count_requested, count_generated, failure_reason, created_at, completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listBatchesForUser: ${error.message}`);
  return (data ?? []) as BatchRow[];
}

export async function getBatch(
  supabase: ContentSupabaseClient,
  batchId: string,
): Promise<{
  batch: BatchRow;
  scripts: Array<{ id: string; hook: string | null; body: string; created_at: string }>;
} | null> {
  const { data: batch, error: batchErr } = await supabase
    .from("script_batches")
    .select("id, status, count_requested, count_generated, failure_reason, created_at, completed_at")
    .eq("id", batchId)
    .maybeSingle();

  if (batchErr) throw new Error(`getBatch: ${batchErr.message}`);
  if (!batch) return null;

  const { data: scripts, error: scriptsErr } = await supabase
    .from("scripts")
    .select("id, hook, body, created_at")
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });

  if (scriptsErr) throw new Error(`getBatch scripts: ${scriptsErr.message}`);

  return {
    batch: batch as BatchRow,
    scripts: (scripts ?? []) as Array<{
      id: string;
      hook: string | null;
      body: string;
      created_at: string;
    }>,
  };
}

/**
 * Update a batch's status. Used by the Inngest worker to mark running,
 * complete, or failed.
 */
export async function updateBatchStatus(
  supabase: ContentSupabaseClient,
  batchId: string,
  patch: {
    status: "pending" | "running" | "complete" | "failed";
    count_generated?: number;
    failure_reason?: string | null;
    completed_at?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("script_batches")
    .update(patch)
    .eq("id", batchId);
  if (error) {
    log.error("script_batches update failed", {
      batch_id: batchId,
      patch,
      code: error.code,
      message: error.message,
    });
    throw new Error(`updateBatchStatus: ${error.message}`);
  }
}
