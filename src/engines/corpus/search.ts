import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { IEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import type {
  ClientCorpusHit,
  ClientDocumentSourceType,
  SearchClientCorpusInput,
} from "./types";

const log = createLogger("corpus.search");

type Client = SupabaseClient<Database>;

const DEFAULT_LIMIT = 6;
const MAX_QUERY_CHARS = 2000;

export interface SearchClientCorpusDeps {
  supabase: Client;
  embeddings: IEmbeddingsClient;
}

/**
 * Embed the query, run the match_client_chunks RPC, optionally filter by
 * source_type, and return the top hits.
 *
 * Used by:
 *   - chat-engine via `search_client_corpus` tool (BO-046)
 *   - script-generator at gen start (BO-047)
 *
 * Source-type filtering happens in memory rather than as an RPC arg
 * because the RPC is pinned to its signature for the lifetime of the
 * migration. We over-fetch by 2x when a filter is supplied so the top-k
 * result count is preserved after filtering. If filters become a routine
 * concern, push them into a new RPC variant rather than tweaking this one.
 */
export async function searchClientCorpus(
  deps: SearchClientCorpusDeps,
  input: SearchClientCorpusInput,
): Promise<ClientCorpusHit[]> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 50));
  const sources = normalizeSourceTypes(input.source_type);

  const query = input.query?.trim() ?? "";
  if (query.length === 0) {
    log.debug("searchClientCorpus called with empty query", {
      user_id: input.user_id,
    });
    return [];
  }
  if (!input.user_id) {
    throw new Error("searchClientCorpus: user_id is required");
  }

  // The embedding model has a hard token cap. Truncating up front is
  // cheaper than catching the API error and avoids paying for tokens we
  // were never going to use signal from anyway.
  const effectiveQuery = query.slice(0, MAX_QUERY_CHARS);
  const fetchLimit = sources ? Math.min(50, limit * 2) : limit;

  const startedAt = Date.now();
  // input_type=query steers Voyage toward the retrieval-query distribution,
  // which materially improves recall against chunks embedded with
  // input_type=document at ingest. See embeddings.ts header for context.
  const [embedding] = await deps.embeddings.embed([effectiveQuery], {
    inputType: "query",
  });

  const { data, error } = await deps.supabase.rpc("match_client_chunks", {
    query_embedding: embedding as unknown as string,
    match_user_id: input.user_id,
    match_count: fetchLimit,
  });

  if (error) {
    log.error("match_client_chunks failed", {
      user_id: input.user_id,
      error: error.message,
    });
    throw new Error(`searchClientCorpus: ${error.message}`);
  }

  const allHits = (data ?? []).map(toHit);
  const filtered = sources
    ? allHits.filter((h) => sources.includes(h.source_type))
    : allHits;
  const top = filtered.slice(0, limit);

  log.info("searchClientCorpus done", {
    user_id: input.user_id,
    query_chars: effectiveQuery.length,
    truncated: query.length > MAX_QUERY_CHARS,
    rpc_returned: allHits.length,
    after_filter: filtered.length,
    returned: top.length,
    duration_ms: Date.now() - startedAt,
  });

  return top;
}

/**
 * Render the hits into a compact text block suitable for injection into a
 * chat tool_result or a script-generator system prompt. Each hit is
 * fenced with its source type and document title; chunks themselves are
 * left verbatim so the model can quote from them directly.
 *
 * Kept here (alongside the retrieval call) rather than in the chat tool
 * so the script-generator implicit retrieval can reuse the exact same
 * format and the model doesn't have to learn two retrieval shapes.
 */
export function formatCorpusHits(hits: ClientCorpusHit[]): string {
  if (hits.length === 0) {
    return "No matching context found in the creator's corpus.";
  }
  const lines: string[] = [];
  hits.forEach((h, i) => {
    lines.push(
      `--- [${i + 1}] ${h.source_type} | "${h.document_title}" | captured ${h.captured_at.slice(0, 10)} | similarity ${h.similarity.toFixed(3)} ---`,
    );
    lines.push(h.chunk_text.trim());
    lines.push("");
  });
  return lines.join("\n").trim();
}

function normalizeSourceTypes(
  input: SearchClientCorpusInput["source_type"],
): ClientDocumentSourceType[] | null {
  if (!input) return null;
  const arr = Array.isArray(input) ? input : [input];
  if (arr.length === 0) return null;
  return arr;
}

function toHit(row: {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  source_type: string;
  document_title: string;
  captured_at: string;
  similarity: number;
}): ClientCorpusHit {
  return {
    chunk_id: row.chunk_id,
    document_id: row.document_id,
    chunk_index: row.chunk_index,
    chunk_text: row.chunk_text,
    source_type: row.source_type as ClientDocumentSourceType,
    document_title: row.document_title,
    captured_at: row.captured_at,
    similarity: typeof row.similarity === "number" ? row.similarity : Number(row.similarity),
  };
}
