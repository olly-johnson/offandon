import { createLogger } from "@/lib/shared/logger";
import type { VoiceDNA } from "@/engines/voice/types";
import type { ILLMClient } from "@/engines/voice/voice";

import { MemoryEngine } from "./memory-engine";
import {
  listMemoriesForUser,
  saveMemories,
  type MemorySupabaseClient,
} from "./persistence";

const log = createLogger("memory.run-extractor");

/**
 * One-shot post-chat extractor. Loads the user's current memories so the
 * Haiku pass can de-dup, asks the engine for new facts based on the last
 * user+assistant exchange, persists whatever comes back.
 *
 * Intended to be called inside Next.js `after()` so the user's reply
 * isn't blocked on the extra round-trip. Swallows every failure;
 * extraction is best-effort and must never bubble up.
 */
export async function runMemoryExtractor(args: {
  supabase: MemorySupabaseClient;
  llm: ILLMClient;
  voiceDna: VoiceDNA;
  userId: string;
  conversationId: string;
  recentTurns: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void> {
  try {
    const existing = await listMemoriesForUser(args.supabase, args.userId, 24);
    const engine = new MemoryEngine({ llm: args.llm });
    const { facts } = await engine.extract({
      voiceDna: args.voiceDna,
      existingMemories: existing,
      recentTurns: args.recentTurns,
    });

    if (facts.length === 0) {
      log.debug("memory extractor: no facts to save", {
        user_id: args.userId,
        conversation_id: args.conversationId,
      });
      return;
    }

    await saveMemories(args.supabase, {
      userId: args.userId,
      conversationId: args.conversationId,
      facts,
    });

    log.info("memory extractor: persisted facts", {
      user_id: args.userId,
      conversation_id: args.conversationId,
      count: facts.length,
    });
  } catch (err) {
    log.error("memory extractor failed", {
      user_id: args.userId,
      conversation_id: args.conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
