import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("memory.persistence");

export type MemorySupabaseClient = SupabaseClient<Database>;

export type MemoryCategory =
  | "ongoing_project"
  | "creator_context"
  | "preference"
  | "recent_topic";

export interface ExtractedFact {
  fact: string;
  category: MemoryCategory;
  /** 1..5; clamped on save so the model can output 0/10 without breaking the check constraint. */
  priority: number;
}

export interface MemoryRow {
  id: string;
  fact: string;
  category: MemoryCategory;
  priority: number;
  source_conversation_id: string | null;
  created_at: string;
}

function clampPriority(p: number): number {
  if (!Number.isFinite(p)) return 3;
  return Math.max(1, Math.min(5, Math.round(p)));
}

/**
 * Persist a batch of newly-extracted facts. Each row is one fact. The
 * `conversationId` provenance is best-effort; it goes ON DELETE SET NULL so
 * the fact survives a chat wipe.
 *
 * Facts are trimmed; blanks after trim are dropped silently. Priority is
 * clamped to 1..5 to match the table's check constraint.
 */
export async function saveMemories(
  supabase: MemorySupabaseClient,
  args: {
    userId: string;
    conversationId: string | null;
    facts: ExtractedFact[];
  },
): Promise<void> {
  const cleaned = args.facts
    .map((f) => ({
      user_id: args.userId,
      fact: f.fact.trim(),
      category: f.category,
      priority: clampPriority(f.priority),
      source_conversation_id: args.conversationId,
    }))
    .filter((row) => row.fact.length > 0);

  if (cleaned.length === 0) {
    return;
  }

  const { error } = await supabase.from("user_memories").insert(cleaned);
  if (error) {
    log.error("user_memories insert failed", {
      user_id: args.userId,
      conversation_id: args.conversationId,
      count: cleaned.length,
      code: error.code,
      message: error.message,
    });
    throw new Error(`saveMemories: ${error.message}`);
  }
  log.debug("memories inserted", {
    user_id: args.userId,
    count: cleaned.length,
  });
}

/**
 * Read a user's memories, top-N by priority desc then created_at desc.
 * The default cap (24) is a soft cap intended for the /memory page; the
 * prompt builder picks its own tighter cap via the limit arg.
 */
export async function listMemoriesForUser(
  supabase: MemorySupabaseClient,
  userId: string,
  limit = 24,
): Promise<MemoryRow[]> {
  const { data, error } = await supabase
    .from("user_memories")
    .select("id, fact, category, priority, source_conversation_id, created_at")
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listMemoriesForUser: ${error.message}`);
  return (data ?? []) as MemoryRow[];
}

/**
 * Delete one memory row. RLS confines the delete to rows owned by the
 * caller; no user_id arg is needed.
 */
export async function deleteMemory(
  supabase: MemorySupabaseClient,
  memoryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_memories")
    .delete()
    .eq("id", memoryId);
  if (error) {
    log.error("user_memories delete failed", {
      memory_id: memoryId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`deleteMemory: ${error.message}`);
  }
}
