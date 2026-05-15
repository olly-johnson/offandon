/**
 * Client corpus types (BO-049).
 *
 * Tier 2 of the two-tier client information model. See migration
 * 20260515000000_client_corpus.sql for the schema rationale.
 */

export type ClientDocumentSourceType =
  | "fathom_transcript"
  | "questionnaire"
  | "note"
  | "long_form";

export interface ClientDocument {
  id: string;
  user_id: string;
  source_type: ClientDocumentSourceType;
  title: string;
  body: string;
  captured_at: string;
  source_path: string | null;
  metadata: Record<string, unknown>;
}

export interface ClientDocumentInput {
  user_id: string;
  source_type: ClientDocumentSourceType;
  title: string;
  body: string;
  captured_at?: string;
  source_path?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ClientDocumentChunkInput {
  document_id: string;
  user_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/**
 * Shape returned by the match_client_chunks RPC + the higher-level
 * searchClientCorpus helper. similarity is in [0, 1] (cosine, normalized).
 */
export interface ClientCorpusHit {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  chunk_text: string;
  source_type: ClientDocumentSourceType;
  document_title: string;
  captured_at: string;
  similarity: number;
}

export interface SearchClientCorpusInput {
  user_id: string;
  query: string;
  /** Top-k chunks to return. Clamped to [1, 50] by the RPC. */
  limit?: number;
  /** Optional source-type filter applied in-memory after the RPC. */
  source_type?: ClientDocumentSourceType | ClientDocumentSourceType[];
}
