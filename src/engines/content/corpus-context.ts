/**
 * Implicit corpus retrieval for batch script generation (BO-051).
 *
 * The batch generator doesn't take a per-batch seed prompt — the operator
 * just asks for N scripts. To ground a batch in the creator's recent
 * recorded conversations (Fathom calls) and weekly questionnaire answers,
 * we derive a seed from the creator's identity (pillars + audience
 * persona) and pull top-k corpus chunks at gen start.
 *
 * Always-retrieve at this surface (vs. on-demand for chat) because every
 * batch benefits from corpus grounding — there's no "the user didn't ask
 * a recall question" path that would skip retrieval. Implicit retrieval
 * adds ~150 ms per batch (Voyage embed + pgvector RPC), invisible against
 * the ~15-25s the Anthropic call takes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type ClientCorpusHit,
  searchClientCorpus,
} from "@/engines/corpus";
import type { VoiceDNA } from "@/engines/voice/types";
import type { IEmbeddingsClient } from "@/lib/shared/embeddings";
import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("content.corpus-context");

/** Top-k chunks retrieved per batch. Sized so the rendered block sits around 4-5K chars. */
export const DEFAULT_SCRIPTS_CORPUS_LIMIT = 8;

export interface ScriptsCorpusContext {
  hits: ClientCorpusHit[];
}

export interface LoadScriptsCorpusContextDeps {
  supabase: SupabaseClient<Database>;
  embeddings: IEmbeddingsClient;
}

export interface LoadScriptsCorpusContextArgs {
  userId: string;
  voiceDna: VoiceDNA;
  /** Override the top-k. Clamped to [1, 50] by searchClientCorpus. */
  limit?: number;
}

/**
 * Pull the top-k corpus chunks relevant to this creator's identity. Always
 * embeds with input_type=query (via searchClientCorpus). Returns an empty
 * hits array (not null) when the user has no corpus content, so the caller
 * can pass the result through unconditionally.
 */
export async function loadScriptsCorpusContext(
  deps: LoadScriptsCorpusContextDeps,
  args: LoadScriptsCorpusContextArgs,
): Promise<ScriptsCorpusContext> {
  const seed = buildScriptsSeedQuery(args.voiceDna);
  const hits = await searchClientCorpus(deps, {
    user_id: args.userId,
    query: seed,
    limit: args.limit ?? DEFAULT_SCRIPTS_CORPUS_LIMIT,
  });
  log.info("loaded scripts corpus context", {
    user_id: args.userId,
    seed_chars: seed.length,
    hit_count: hits.length,
  });
  return { hits };
}

/**
 * Derive a seed query from the creator's identity. Combines pillar names
 * with persona description so retrieval surfaces both topic-relevant
 * chunks (pillar-aligned) and audience-relevant chunks (persona-aligned).
 *
 * Deliberately broad: at batch time we want diverse retrieval, not
 * needle-in-haystack precision. The model will filter as it writes each
 * script.
 */
export function buildScriptsSeedQuery(voiceDna: VoiceDNA): string {
  const pillars = voiceDna.content_pillars
    .map((p) => p.name)
    .filter((n) => n.trim().length > 0);
  const persona = voiceDna.audience_persona.description?.trim() ?? "";
  const parts: string[] = [
    "Recent themes, stories, breakthroughs, and frameworks from this creator.",
  ];
  if (pillars.length > 0) {
    parts.push(`Content pillars: ${pillars.join(", ")}.`);
  }
  if (persona.length > 0) {
    parts.push(`Audience: ${persona}`);
  }
  return parts.join(" ");
}

export function hasCorpusHits(ctx: ScriptsCorpusContext | null | undefined): boolean {
  if (!ctx) return false;
  return ctx.hits.length > 0;
}
