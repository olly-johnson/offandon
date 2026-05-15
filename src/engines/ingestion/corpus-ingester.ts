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

/**
 * Allow-list of file extensions to ingest. Anything outside this list is
 * skipped silently (binaries, images, dashboards, etc.). Keep it small;
 * a corpus document needs to be text-shaped for chunking and embedding
 * to produce useful signal.
 */
const INGESTIBLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".md",
  ".txt",
  ".json",
]);

/**
 * Files and directories that look text-shaped but are operator-generated
 * dashboards, performance dumps, or sidecars that don't belong in the
 * retrieval corpus. Matched against the path relative to the client
 * directory; trailing slash indicates a directory to skip wholesale.
 */
const ALWAYS_SKIP_PATHS: ReadonlySet<string> = new Set([
  // Sidecars produced by this and the BO-042 ingestion pipelines.
  ".extracted.json",
  ".corpus-ingested.json",
  // Generated dashboards / metrics / classified outputs — purely derived
  // data that adds noise and bloats the corpus without informing
  // anything the bot needs to re-derive.
  "business_dashboard.html",
  "dashboard.json",
  "dashboard_insights.json",
  "classified_posts.json",
  "metrics_history.json",
  "content_pipeline.json",
]);

const ALWAYS_SKIP_DIRS: ReadonlySet<string> = new Set([
  "performance",
  "youtube",
  "node_modules",
  ".git",
]);

/**
 * Subdirectory → semantic source_type. Anything not listed here falls
 * through to `long_form` (the catch-all). This keeps the source_type
 * enum stable while still letting future ingest of (e.g.) Fathom drops
 * be classified correctly when the operator drops files in
 * `transcripts/`.
 */
const SUBDIR_TO_SOURCE_TYPE: Record<string, ClientDocumentSourceType> = {
  transcripts: "fathom_transcript",
  questionnaires: "questionnaire",
  notes: "note",
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
 * Walk the entire `clientDir` recursively and return every file that
 * should be ingested. Anything in `ALWAYS_SKIP_PATHS`, under an
 * `ALWAYS_SKIP_DIRS` directory, or with an extension outside
 * `INGESTIBLE_EXTENSIONS` is filtered out silently.
 *
 * source_type is assigned by the file's TOP-LEVEL directory under the
 * client folder (so `transcripts/2025-W18/foo.txt` is a
 * fathom_transcript). Files at the root of `clientDir` and anything
 * inside a non-mapped subdirectory fall back to `long_form` — the
 * catch-all that keeps every text-shaped file searchable without
 * needing to expand the source_type enum every time a new operator
 * convention shows up.
 *
 * The result is sorted by relative path so runs are deterministic.
 */
export function discoverCorpusFiles(clientDir: string): DiscoveredCorpusFile[] {
  const out: DiscoveredCorpusFile[] = [];
  walk(clientDir, clientDir, out);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

function walk(root: string, dir: string, out: DiscoveredCorpusFile[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    log.warn("could not read directory", {
      dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const entry of entries) {
    const abs = join(dir, entry);
    const rel = relativeFromRoot(root, abs);

    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry)) continue;
      walk(root, abs, out);
      continue;
    }
    if (!stat.isFile()) continue;

    if (ALWAYS_SKIP_PATHS.has(entry) || ALWAYS_SKIP_PATHS.has(rel)) continue;

    const ext = extname(entry).toLowerCase();
    if (!INGESTIBLE_EXTENSIONS.has(ext)) continue;

    const topDir = rel.includes("/") ? rel.split("/", 1)[0] : "";
    const sourceType: ClientDocumentSourceType =
      SUBDIR_TO_SOURCE_TYPE[topDir] ?? "long_form";

    // Fathom drops a speaker-attributed `<id>.txt` and an audio-only
    // `<id>_audio.txt`. The first is canonical; skip the mirror so the
    // same conversation doesn't get embedded twice.
    if (
      sourceType === "fathom_transcript" &&
      entry.toLowerCase().endsWith("_audio.txt")
    ) {
      continue;
    }

    out.push({
      absolutePath: abs,
      relativePath: rel,
      sourceType,
      title: humaniseRelativePath(rel, ext),
      mtime: stat.mtime.toISOString(),
    });
  }
}

function relativeFromRoot(root: string, abs: string): string {
  // Use POSIX-style separators in the upsert key + watermark so a
  // path written on Windows still matches the same file on Mac/Linux
  // (and vice-versa). The on-disk operations use the platform-native
  // absolutePath; only the stored relativePath is normalised.
  return abs.slice(root.length).replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

function humaniseRelativePath(rel: string, ext: string): string {
  // Use the full relative path (sans extension) so files nested in
  // subfolders carry context in their display title — a script called
  // `script_01_top_hero's_journey.md` inside `scripts/2026-W08/` reads
  // as `scripts 2026 W08 script 01 top hero's journey` rather than
  // colliding with any other `script_01...` in another week.
  const sansExt = rel.slice(0, rel.length - ext.length);
  const cleaned = sansExt.replace(/[\\/_-]+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : rel;
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
