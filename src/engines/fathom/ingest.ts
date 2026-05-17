/**
 * Ingest a Fathom recording into the client corpus.
 *
 * Writes one row to client_documents (source_type='fathom_transcript')
 * and replaces its chunks in client_document_chunks. Idempotent by
 * `(user_id, source_path)` where source_path is `fathom://<recording_id>` —
 * re-ingesting the same recording (replay, manual re-trigger) overwrites
 * the prior row + chunks rather than producing duplicates.
 *
 * Mirror of engines/ingestion/corpus-ingester.ts `ingestCorpusFile`, but
 * accepts the text from an in-memory FathomRecording instead of reading
 * from disk. The chunking/embedding contract is identical so retrieval
 * via match_client_chunks works without further plumbing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  replaceDocumentChunks,
  saveClientDocument,
  type ClientDocumentInput,
} from "@/engines/corpus";
import {
  chunkText,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_CHUNK_TARGET_CHARS,
  type IEmbeddingsClient,
} from "@/lib/shared/embeddings";
import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { FathomRecording } from "./types";

const log = createLogger("fathom.ingest");

export const FATHOM_SOURCE_PATH_PREFIX = "fathom://";

export interface IngestFathomDeps {
  supabase: SupabaseClient<Database>;
  embeddings: IEmbeddingsClient;
}

export interface IngestFathomArgs {
  userId: string;
  recording: FathomRecording;
  chunkTargetChars?: number;
  chunkOverlapChars?: number;
}

export interface IngestFathomResult {
  documentId: string;
  chunkCount: number;
  sourcePath: string;
}

/**
 * Build the embed-friendly body. We prepend a small metadata header so
 * retrieval can match on title + attendees even when the question is
 * "who was on the call with Alice last week?" — embeddings see that
 * context, not just the speaker turns.
 */
export function buildIngestBody(recording: FathomRecording): string {
  const inviteeLine = recording.invitees
    .map((i) => (i.name ? `${i.name} <${i.email}>` : i.email))
    .join(", ");
  const summaryBlock = recording.summary
    ? `\n\nSummary:\n${recording.summary.trim()}`
    : "";
  return [
    `Title: ${recording.title}`,
    `Started: ${recording.startedAt}`,
    `Attendees: ${inviteeLine || "unknown"}`,
    summaryBlock.trim() ? "" : null,
    summaryBlock.trim() ? summaryBlock.trim() : "",
    "",
    "Transcript:",
    recording.transcriptPlaintext.trim(),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function fathomSourcePath(recordingId: string): string {
  return `${FATHOM_SOURCE_PATH_PREFIX}${recordingId}`;
}

export async function ingestFathomRecording(
  deps: IngestFathomDeps,
  args: IngestFathomArgs,
): Promise<IngestFathomResult> {
  const body = buildIngestBody(args.recording).trim();
  if (body.length === 0) {
    throw new Error(
      `ingestFathomRecording: empty body for ${args.recording.recordingId}`,
    );
  }

  const sourcePath = fathomSourcePath(args.recording.recordingId);
  const docInput: ClientDocumentInput = {
    user_id: args.userId,
    source_type: "fathom_transcript",
    title: args.recording.title,
    body,
    captured_at: args.recording.startedAt,
    source_path: sourcePath,
    metadata: {
      recording_id: args.recording.recordingId,
      share_url: args.recording.shareUrl ?? null,
      duration_seconds: args.recording.durationSeconds ?? null,
      invitees: args.recording.invitees,
      ingested_at: new Date().toISOString(),
    },
  };

  const doc = await saveClientDocument(deps.supabase, docInput);

  const chunks = chunkText(body, {
    targetChars: args.chunkTargetChars ?? DEFAULT_CHUNK_TARGET_CHARS,
    overlapChars: args.chunkOverlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS,
  });
  if (chunks.length === 0) {
    throw new Error(
      `ingestFathomRecording: chunkText returned zero chunks for ${args.recording.recordingId}`,
    );
  }

  const embeddings = await deps.embeddings.embed(
    chunks.map((c) => c.text),
    { inputType: "document" },
  );
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `ingestFathomRecording: embedder returned ${embeddings.length} vectors for ${chunks.length} chunks`,
    );
  }

  await replaceDocumentChunks(
    deps.supabase,
    doc.id,
    chunks.map((c, i) => ({
      document_id: doc.id,
      user_id: args.userId,
      chunk_index: c.index,
      chunk_text: c.text,
      embedding: embeddings[i],
      metadata: {},
    })),
  );

  log.info("fathom recording ingested", {
    user_id: args.userId,
    recording_id: args.recording.recordingId,
    chunk_count: chunks.length,
  });

  return {
    documentId: doc.id,
    chunkCount: chunks.length,
    sourcePath,
  };
}
