/**
 * Corpus ingester (BO-052).
 *
 * Walks `clients/<slug>/transcripts/`, `questionnaires/`, `notes/`,
 * `long_form/` — chunks each file, embeds with Voyage (input_type=
 * document), writes to client_documents + client_document_chunks.
 *
 * Incremental by design. A sidecar `.corpus-ingested.json` lives next to
 * the existing `.extracted.json` and records every processed file's mtime
 * + assigned document_id + chunk_count. On re-run, files whose mtime is
 * unchanged are skipped; new or modified files are re-chunked and re-
 * embedded, with prior chunks wiped via replaceDocumentChunks before the
 * new ones land. Deleted files leave their DB rows in place — pruning is
 * a manual operator step today (see PRE_LAUNCH_CHECKLIST §2).
 *
 * Source-type mapping by directory:
 *   transcripts/    -> fathom_transcript    (skips *_audio.txt mirrors)
 *   questionnaires/ -> questionnaire
 *   notes/          -> note
 *   long_form/      -> long_form
 *
 * The module is filesystem-aware but the supabase / embeddings deps are
 * injected so tests can stub them out without writing to disk.
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type ClientDocumentInput,
  type ClientDocumentSourceType,
  replaceDocumentChunks,
  saveClientDocument,
} from "@/engines/corpus";
import {
  chunkText,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_CHUNK_TARGET_CHARS,
  type IEmbeddingsClient,
} from "@/lib/shared/embeddings";
import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("ingestion.corpus");

export const CORPUS_WATERMARK_FILENAME = ".corpus-ingested.json";

/** Filename of the sidecar that pins (path, mtime, document_id) so re-runs skip unchanged files. */
const SUBDIR_TO_SOURCE_TYPE: Record<string, ClientDocumentSourceType> = {
  transcripts: "fathom_transcript",
  questionnaires: "questionnaire",
  notes: "note",
  long_form: "long_form",
};

const EXTENSIONS_BY_SOURCE: Record<ClientDocumentSourceType, ReadonlySet<string>> = {
  fathom_transcript: new Set([".txt"]),
  questionnaire: new Set([".md", ".txt"]),
  note: new Set([".md", ".txt"]),
  long_form: new Set([".md", ".txt"]),
};

export interface DiscoveredCorpusFile {
  /** Absolute path on disk. */
  absolutePath: string;
  /** Path relative to clients/<slug>/, used as the upsert key (`source_path`). */
  relativePath: string;
  sourceType: ClientDocumentSourceType;
  /** Display title derived from the filename (sans extension, separators humanised). */
  title: string;
  /** ISO timestamp from file mtime. Also used as `captured_at` unless overridden. */
  mtime: string;
}

export interface CorpusWatermarkEntry {
  mtime: string;
  document_id: string;
  chunk_count: number;
}

export interface CorpusWatermark {
  files: Record<string, CorpusWatermarkEntry>;
}

export interface IngestCorpusDeps {
  supabase: SupabaseClient<Database>;
  embeddings: IEmbeddingsClient;
}

export interface IngestCorpusArgs {
  userId: string;
  /** Absolute path to the client directory, e.g. resolve("clients/alex_shaw"). */
  clientDir: string;
  /** Force re-process of every discovered file regardless of watermark. */
  rebuild?: boolean;
  /** Override chunk sizing. Defaults match the embeddings module. */
  chunkTargetChars?: number;
  chunkOverlapChars?: number;
  /** Optional progress callback for CLI surfacing. */
  onLog?: (line: string) => void;
}

export interface IngestCorpusResult {
  processed: number;
  skipped: number;
  failed: Array<{ relativePath: string; error: string }>;
}

/* ---------------------------------------------------------------------------
 * Discovery
 * --------------------------------------------------------------------------- */

/**
 * Walk the recognised subdirectories under `clientDir` and return every
 * file that should be considered for ingestion. The result is sorted so
 * runs are deterministic (useful for logs and tests).
 */
export function discoverCorpusFiles(clientDir: string): DiscoveredCorpusFile[] {
  const out: DiscoveredCorpusFile[] = [];

  for (const [subdir, sourceType] of Object.entries(SUBDIR_TO_SOURCE_TYPE)) {
    const absSubdir = join(clientDir, subdir);
    if (!existsSync(absSubdir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(absSubdir);
    } catch (err) {
      log.warn("could not read corpus subdir", {
        subdir: absSubdir,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    for (const entry of entries) {
      const abs = join(absSubdir, entry);
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;

      const ext = extname(entry).toLowerCase();
      if (!EXTENSIONS_BY_SOURCE[sourceType].has(ext)) continue;

      // Fathom drops a speaker-attributed `<id>.txt` and an audio-only
      // `<id>_audio.txt`. The first is canonical; skip the mirror so
      // the same conversation doesn't get embedded twice.
      if (sourceType === "fathom_transcript" && entry.toLowerCase().endsWith("_audio.txt")) {
        continue;
      }

      out.push({
        absolutePath: abs,
        relativePath: `${subdir}/${entry}`,
        sourceType,
        title: humaniseFilename(entry, ext),
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

function humaniseFilename(filename: string, ext: string): string {
  const base = filename.slice(0, filename.length - ext.length);
  const cleaned = base.replace(/[_-]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : filename;
}

/* ---------------------------------------------------------------------------
 * Watermark
 * --------------------------------------------------------------------------- */

export function loadWatermark(clientDir: string): CorpusWatermark {
  const path = join(clientDir, CORPUS_WATERMARK_FILENAME);
  if (!existsSync(path)) return { files: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "files" in parsed &&
      typeof (parsed as { files: unknown }).files === "object"
    ) {
      return parsed as CorpusWatermark;
    }
  } catch (err) {
    log.warn("watermark unreadable, starting fresh", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { files: {} };
}

export function saveWatermark(clientDir: string, watermark: CorpusWatermark): void {
  const path = join(clientDir, CORPUS_WATERMARK_FILENAME);
  writeFileSync(path, `${JSON.stringify(watermark, null, 2)}\n`, "utf-8");
}

/**
 * Return the files that need processing this run. A file is processed when:
 *   - `rebuild` is true, OR
 *   - the file is absent from the watermark, OR
 *   - the file's current mtime differs from the watermarked one.
 */
export function selectFilesToProcess(
  discovered: DiscoveredCorpusFile[],
  watermark: CorpusWatermark,
  rebuild = false,
): DiscoveredCorpusFile[] {
  if (rebuild) return [...discovered];
  return discovered.filter((f) => {
    const prev = watermark.files[f.relativePath];
    return !prev || prev.mtime !== f.mtime;
  });
}

/* ---------------------------------------------------------------------------
 * Per-file ingestion
 * --------------------------------------------------------------------------- */

/**
 * Read, chunk, embed, and persist a single file. Returns the assigned
 * document_id + chunk count so the caller can update the watermark.
 *
 * Embedding uses input_type=document (the canonical mode for content that
 * will be searched against). On the chat side searchClientCorpus uses
 * input_type=query — see embeddings.ts header.
 */
export async function ingestCorpusFile(
  deps: IngestCorpusDeps,
  args: {
    userId: string;
    file: DiscoveredCorpusFile;
    chunkTargetChars?: number;
    chunkOverlapChars?: number;
  },
): Promise<{ documentId: string; chunkCount: number }> {
  const body = readFileSync(args.file.absolutePath, "utf-8");
  const cleanBody = body.trim();
  if (cleanBody.length === 0) {
    throw new Error(`empty file: ${args.file.relativePath}`);
  }

  const docInput: ClientDocumentInput = {
    user_id: args.userId,
    source_type: args.file.sourceType,
    title: args.file.title,
    body: cleanBody,
    captured_at: args.file.mtime,
    source_path: args.file.relativePath,
    metadata: { ingested_at: new Date().toISOString() },
  };
  const doc = await saveClientDocument(deps.supabase, docInput);

  const chunks = chunkText(cleanBody, {
    targetChars: args.chunkTargetChars ?? DEFAULT_CHUNK_TARGET_CHARS,
    overlapChars: args.chunkOverlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS,
  });
  if (chunks.length === 0) {
    // A non-empty file producing zero chunks is a chunker bug; surface it.
    throw new Error(`chunkText returned zero chunks for non-empty file ${args.file.relativePath}`);
  }

  const embeddings = await deps.embeddings.embed(
    chunks.map((c) => c.text),
    { inputType: "document" },
  );
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `embedder returned ${embeddings.length} vectors for ${chunks.length} chunks`,
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

  return { documentId: doc.id, chunkCount: chunks.length };
}

/* ---------------------------------------------------------------------------
 * Top-level orchestration
 * --------------------------------------------------------------------------- */

/**
 * Discover, filter by watermark, and ingest every newly-changed file under
 * `clientDir`. Per-file failures are captured into `result.failed` so one
 * bad file doesn't sink the whole run — the watermark is updated only for
 * successfully processed files, so a retry naturally picks the failed
 * ones up again.
 */
export async function ingestCorpus(
  deps: IngestCorpusDeps,
  args: IngestCorpusArgs,
): Promise<IngestCorpusResult> {
  const onLog = args.onLog ?? (() => {});
  const discovered = discoverCorpusFiles(args.clientDir);
  const watermark = loadWatermark(args.clientDir);
  const toProcess = selectFilesToProcess(discovered, watermark, args.rebuild);

  onLog(
    `discovered ${discovered.length} files, ${toProcess.length} need processing (rebuild=${!!args.rebuild})`,
  );

  const result: IngestCorpusResult = {
    processed: 0,
    skipped: discovered.length - toProcess.length,
    failed: [],
  };

  for (const file of toProcess) {
    try {
      const { documentId, chunkCount } = await ingestCorpusFile(deps, {
        userId: args.userId,
        file,
        chunkTargetChars: args.chunkTargetChars,
        chunkOverlapChars: args.chunkOverlapChars,
      });
      watermark.files[file.relativePath] = {
        mtime: file.mtime,
        document_id: documentId,
        chunk_count: chunkCount,
      };
      result.processed += 1;
      onLog(`  ✓ ${file.relativePath} (${chunkCount} chunks)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failed.push({ relativePath: file.relativePath, error: message });
      onLog(`  ✗ ${file.relativePath} — ${message}`);
      log.error("corpus ingestion file failed", {
        user_id: args.userId,
        relative_path: file.relativePath,
        error: message,
      });
    }
  }

  // Persist the watermark even on partial-failure runs so successful files
  // aren't re-processed on the next attempt. Failures stay un-watermarked
  // so the operator's next `ingest:corpus` re-tries them automatically.
  saveWatermark(args.clientDir, watermark);

  onLog(
    `done. processed=${result.processed} skipped=${result.skipped} failed=${result.failed.length}`,
  );
  return result;
}
