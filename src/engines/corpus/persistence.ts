import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import { EMBEDDING_DIMENSIONS } from "@/lib/shared/embeddings";

import type {
  ClientDocument,
  ClientDocumentChunkInput,
  ClientDocumentInput,
} from "./types";

const log = createLogger("corpus.persistence");

type Client = SupabaseClient<Database>;

/**
 * Upsert a raw document. Idempotent by (user_id, source_path) — re-ingesting
 * a file overwrites the prior row so we don't accumulate stale copies.
 * When source_path is null (e.g. a one-off note pasted by the operator)
 * the upsert key falls back to insert.
 */
export async function saveClientDocument(
  supabase: Client,
  input: ClientDocumentInput,
): Promise<ClientDocument> {
  const row = {
    user_id: input.user_id,
    source_type: input.source_type,
    title: input.title,
    body: input.body,
    captured_at: input.captured_at ?? new Date().toISOString(),
    source_path: input.source_path ?? null,
    metadata: (input.metadata ?? {}) as Database["public"]["Tables"]["client_documents"]["Insert"]["metadata"],
  };

  if (row.source_path) {
    const { data, error } = await supabase
      .from("client_documents")
      .upsert(row, { onConflict: "user_id,source_path" })
      .select(
        "id, user_id, source_type, title, body, captured_at, source_path, metadata",
      )
      .single();
    if (error) {
      log.error("saveClientDocument upsert failed", {
        user_id: input.user_id,
        source_path: input.source_path,
        error: error.message,
      });
      throw new Error(`saveClientDocument: ${error.message}`);
    }
    return toDocument(data);
  }

  const { data, error } = await supabase
    .from("client_documents")
    .insert(row)
    .select(
      "id, user_id, source_type, title, body, captured_at, source_path, metadata",
    )
    .single();
  if (error) {
    log.error("saveClientDocument insert failed", {
      user_id: input.user_id,
      error: error.message,
    });
    throw new Error(`saveClientDocument: ${error.message}`);
  }
  return toDocument(data);
}

/**
 * Replace all chunks for a given document. Used during ingestion so a
 * re-ingest never leaves orphaned old chunks alongside fresh ones.
 *
 * Two-step (delete then insert) rather than upsert because chunk_index is
 * not a stable key across re-chunks — chunk boundaries shift if the source
 * text changes by even a paragraph.
 */
export async function replaceDocumentChunks(
  supabase: Client,
  documentId: string,
  chunks: ClientDocumentChunkInput[],
): Promise<void> {
  if (chunks.length === 0) {
    log.warn("replaceDocumentChunks called with empty chunks", { documentId });
  }
  for (const c of chunks) {
    if (c.document_id !== documentId) {
      throw new Error(
        `replaceDocumentChunks: chunk.document_id ${c.document_id} != ${documentId}`,
      );
    }
    if (!Array.isArray(c.embedding) || c.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `replaceDocumentChunks: embedding for chunk ${c.chunk_index} has dimension ${c.embedding?.length}, expected ${EMBEDDING_DIMENSIONS}`,
      );
    }
  }

  const { error: deleteErr } = await supabase
    .from("client_document_chunks")
    .delete()
    .eq("document_id", documentId);
  if (deleteErr) {
    log.error("replaceDocumentChunks delete failed", {
      documentId,
      error: deleteErr.message,
    });
    throw new Error(`replaceDocumentChunks delete: ${deleteErr.message}`);
  }

  if (chunks.length === 0) return;

  // pgvector accepts the textual literal "[0.1,0.2,...]" via supabase-js.
  // Sending the array as JSON is also accepted, but the literal form is
  // unambiguous regardless of jsonb column inference and matches what
  // psql users expect when debugging.
  const rows = chunks.map((c) => ({
    document_id: c.document_id,
    user_id: c.user_id,
    chunk_index: c.chunk_index,
    chunk_text: c.chunk_text,
    embedding: vectorLiteral(c.embedding),
    metadata: (c.metadata ?? {}) as Database["public"]["Tables"]["client_document_chunks"]["Insert"]["metadata"],
  }));

  const { error: insertErr } = await supabase
    .from("client_document_chunks")
    .insert(rows);
  if (insertErr) {
    log.error("replaceDocumentChunks insert failed", {
      documentId,
      chunk_count: rows.length,
      error: insertErr.message,
    });
    throw new Error(`replaceDocumentChunks insert: ${insertErr.message}`);
  }

  log.info("replaceDocumentChunks committed", {
    documentId,
    chunk_count: rows.length,
  });
}

/**
 * Convert a number[] to a pgvector textual literal. Bracketed, comma-
 * separated, no whitespace — accepted by pgvector's input parser. Numbers
 * use plain decimal representation so we don't risk "1e-05" being mis-
 * parsed (pgvector handles it, but defending the contract anyway).
 */
function vectorLiteral(v: number[]): string {
  return `[${v.map((n) => Number.isFinite(n) ? n.toString() : "0").join(",")}]`;
}

function toDocument(row: {
  id: string;
  user_id: string;
  source_type: string;
  title: string;
  body: string;
  captured_at: string;
  source_path: string | null;
  metadata: unknown;
}): ClientDocument {
  return {
    id: row.id,
    user_id: row.user_id,
    source_type: row.source_type as ClientDocument["source_type"],
    title: row.title,
    body: row.body,
    captured_at: row.captured_at,
    source_path: row.source_path,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}
