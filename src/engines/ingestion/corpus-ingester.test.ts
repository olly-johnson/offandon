import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EMBEDDING_DIMENSIONS, type IEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import {
  CORPUS_WATERMARK_FILENAME,
  discoverCorpusFiles,
  ingestCorpus,
  ingestCorpusFile,
  loadWatermark,
  saveWatermark,
  selectFilesToProcess,
} from "./corpus-ingester";

const USER_ID = "11111111-1111-1111-1111-111111111111";

/* ---------------------------------------------------------------------------
 * Tmp-dir scaffolding
 * --------------------------------------------------------------------------- */

let workspace = "";
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "corpus-ingest-"));
});
afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

function writeFile(relPath: string, body: string, mtime?: Date): string {
  const abs = join(workspace, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf-8");
  if (mtime) {
    utimesSync(abs, mtime, mtime);
  }
  return abs;
}

/* ---------------------------------------------------------------------------
 * Supabase + embeddings mocks
 * --------------------------------------------------------------------------- */

interface SupabaseLog {
  upserts: Array<{ row: Record<string, unknown>; onConflict?: string }>;
  deletes: Array<{ column: string; value: string }>;
  chunkInserts: Array<Array<Record<string, unknown>>>;
}

function makeSupabase(): { client: SupabaseClient<Database>; log: SupabaseLog } {
  const log: SupabaseLog = {
    upserts: [],
    deletes: [],
    chunkInserts: [],
  };
  let docCounter = 0;
  const client = {
    from(table: string) {
      if (table === "client_documents") {
        return {
          upsert(row: Record<string, unknown>, options?: { onConflict?: string }) {
            log.upserts.push({ row, onConflict: options?.onConflict });
            docCounter += 1;
            const fakeId = `doc-${docCounter}`;
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: fakeId,
                      user_id: row.user_id,
                      source_type: row.source_type,
                      title: row.title,
                      body: row.body,
                      captured_at: row.captured_at,
                      source_path: row.source_path,
                      metadata: row.metadata,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          insert(row: Record<string, unknown>) {
            // Non-source-path path: not exercised in these tests, but
            // exists so the type contract holds.
            log.upserts.push({ row });
            return {
              select() {
                return {
                  single: async () => ({ data: row, error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "client_document_chunks") {
        return {
          delete() {
            return {
              eq(column: string, value: string) {
                log.deletes.push({ column, value });
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(rows: Array<Record<string, unknown>>) {
            log.chunkInserts.push(rows);
            return {
              then(resolve: (v: { data: unknown; error: unknown }) => void) {
                resolve({ data: rows, error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected from(${table})`);
    },
  } as unknown as SupabaseClient<Database>;
  return { client, log };
}

function makeEmbedder(): IEmbeddingsClient & {
  calls: Array<{ texts: string[]; inputType?: string }>;
} {
  const calls: Array<{ texts: string[]; inputType?: string }> = [];
  return {
    calls,
    async embed(texts, opts) {
      calls.push({ texts: [...texts], inputType: opts?.inputType });
      return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1));
    },
  };
}

/* ---------------------------------------------------------------------------
 * Discovery
 * --------------------------------------------------------------------------- */

describe("discoverCorpusFiles", () => {
  it("walks the recognised subdirs and classifies each file by source_type", () => {
    writeFile("transcripts/2026-05-10-call.txt", "transcript body");
    writeFile("questionnaires/2026-W20.md", "## answers");
    writeFile("notes/random.md", "scratch note");
    writeFile("long_form/big-essay.md", "long essay");

    const out = discoverCorpusFiles(workspace);
    const byPath = new Map(out.map((f) => [f.relativePath, f]));

    expect(out).toHaveLength(4);
    expect(byPath.get("transcripts/2026-05-10-call.txt")?.sourceType).toBe(
      "fathom_transcript",
    );
    expect(byPath.get("questionnaires/2026-W20.md")?.sourceType).toBe("questionnaire");
    expect(byPath.get("notes/random.md")?.sourceType).toBe("note");
    expect(byPath.get("long_form/big-essay.md")?.sourceType).toBe("long_form");
  });

  it("derives a human-friendly title from the filename", () => {
    writeFile("transcripts/strategy-call_with-sarah.txt", "body");
    const [file] = discoverCorpusFiles(workspace);
    expect(file.title).toBe("strategy call with sarah");
  });

  it("skips *_audio.txt mirrors in transcripts/", () => {
    writeFile("transcripts/abc.txt", "real");
    writeFile("transcripts/abc_audio.txt", "audio");
    const out = discoverCorpusFiles(workspace);
    expect(out).toHaveLength(1);
    expect(out[0].relativePath).toBe("transcripts/abc.txt");
  });

  it("ignores files with the wrong extension for a subdir", () => {
    writeFile("transcripts/data.json", "{}");
    writeFile("questionnaires/notes.pdf", "binary");
    const out = discoverCorpusFiles(workspace);
    expect(out).toEqual([]);
  });

  it("ignores unrecognised subdirs entirely", () => {
    writeFile("performance/dashboard.html", "<html/>");
    writeFile("scripts/example.md", "no");
    const out = discoverCorpusFiles(workspace);
    expect(out).toEqual([]);
  });

  it("returns deterministic ordering (sorted by relativePath)", () => {
    writeFile("transcripts/z.txt", "x");
    writeFile("transcripts/a.txt", "x");
    writeFile("questionnaires/m.md", "x");
    const out = discoverCorpusFiles(workspace);
    expect(out.map((f) => f.relativePath)).toEqual([
      "questionnaires/m.md",
      "transcripts/a.txt",
      "transcripts/z.txt",
    ]);
  });

  it("returns empty array when no recognised subdirs exist", () => {
    expect(discoverCorpusFiles(workspace)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Watermark
 * --------------------------------------------------------------------------- */

describe("watermark", () => {
  it("returns an empty watermark when the sidecar is absent", () => {
    expect(loadWatermark(workspace)).toEqual({ files: {} });
  });

  it("round-trips through saveWatermark + loadWatermark", () => {
    const w = {
      files: {
        "transcripts/a.txt": {
          mtime: "2026-05-10T00:00:00.000Z",
          document_id: "doc-1",
          chunk_count: 4,
        },
      },
    };
    saveWatermark(workspace, w);
    expect(loadWatermark(workspace)).toEqual(w);
  });

  it("returns an empty watermark on a malformed sidecar", () => {
    writeFile(CORPUS_WATERMARK_FILENAME, "not json at all");
    expect(loadWatermark(workspace)).toEqual({ files: {} });
  });
});

describe("selectFilesToProcess", () => {
  const file = {
    absolutePath: "/abs/a.txt",
    relativePath: "transcripts/a.txt",
    sourceType: "fathom_transcript" as const,
    title: "a",
    mtime: "2026-05-10T00:00:00.000Z",
  };

  it("processes a file absent from the watermark", () => {
    const out = selectFilesToProcess([file], { files: {} });
    expect(out).toEqual([file]);
  });

  it("skips a file with matching mtime in the watermark", () => {
    const out = selectFilesToProcess([file], {
      files: {
        [file.relativePath]: {
          mtime: file.mtime,
          document_id: "d",
          chunk_count: 1,
        },
      },
    });
    expect(out).toEqual([]);
  });

  it("re-processes a file when its mtime differs", () => {
    const out = selectFilesToProcess([file], {
      files: {
        [file.relativePath]: {
          mtime: "1999-01-01T00:00:00.000Z",
          document_id: "d",
          chunk_count: 1,
        },
      },
    });
    expect(out).toEqual([file]);
  });

  it("rebuild=true ignores the watermark entirely", () => {
    const out = selectFilesToProcess(
      [file],
      {
        files: {
          [file.relativePath]: {
            mtime: file.mtime,
            document_id: "d",
            chunk_count: 1,
          },
        },
      },
      true,
    );
    expect(out).toEqual([file]);
  });
});

/* ---------------------------------------------------------------------------
 * Per-file ingestion
 * --------------------------------------------------------------------------- */

describe("ingestCorpusFile", () => {
  it("upserts the document by source_path, embeds chunks with input_type=document, and writes chunks", async () => {
    writeFile("transcripts/strategy.txt", "transcript body that fits in a single chunk.");
    const { client, log } = makeSupabase();
    const embeddings = makeEmbedder();
    const [discovered] = discoverCorpusFiles(workspace);

    const out = await ingestCorpusFile(
      { supabase: client, embeddings },
      { userId: USER_ID, file: discovered },
    );

    expect(out.documentId).toBe("doc-1");
    expect(out.chunkCount).toBe(1);
    expect(log.upserts).toHaveLength(1);
    expect(log.upserts[0].onConflict).toBe("user_id,source_path");
    expect(log.upserts[0].row.source_type).toBe("fathom_transcript");
    expect(log.upserts[0].row.source_path).toBe("transcripts/strategy.txt");
    expect(log.upserts[0].row.captured_at).toBe(discovered.mtime);

    expect(log.deletes).toEqual([{ column: "document_id", value: "doc-1" }]);
    expect(log.chunkInserts).toHaveLength(1);
    expect(log.chunkInserts[0]).toHaveLength(1);
    expect((log.chunkInserts[0][0].embedding as string).startsWith("[")).toBe(true);

    expect(embeddings.calls).toHaveLength(1);
    expect(embeddings.calls[0].inputType).toBe("document");
  });

  it("chunks a long file across multiple embeddings", async () => {
    const long = "Sentence. ".repeat(800); // ~9600 chars
    writeFile("transcripts/long.txt", long);
    const { client, log } = makeSupabase();
    const embeddings = makeEmbedder();
    const [discovered] = discoverCorpusFiles(workspace);

    const out = await ingestCorpusFile(
      { supabase: client, embeddings },
      { userId: USER_ID, file: discovered, chunkTargetChars: 2000, chunkOverlapChars: 200 },
    );

    expect(out.chunkCount).toBeGreaterThan(1);
    expect(log.chunkInserts[0]).toHaveLength(out.chunkCount);
    expect(embeddings.calls[0].texts).toHaveLength(out.chunkCount);
  });

  it("throws on an empty file", async () => {
    writeFile("transcripts/empty.txt", "   \n   ");
    const { client } = makeSupabase();
    const [discovered] = discoverCorpusFiles(workspace);
    await expect(
      ingestCorpusFile(
        { supabase: client, embeddings: makeEmbedder() },
        { userId: USER_ID, file: discovered },
      ),
    ).rejects.toThrow(/empty file/);
  });
});

/* ---------------------------------------------------------------------------
 * Top-level orchestration
 * --------------------------------------------------------------------------- */

describe("ingestCorpus", () => {
  it("processes every discovered file on first run and writes a watermark", async () => {
    writeFile("transcripts/a.txt", "first transcript body");
    writeFile("questionnaires/b.md", "first questionnaire body");
    const { client } = makeSupabase();

    const out = await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    expect(out.processed).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.failed).toEqual([]);

    const w = loadWatermark(workspace);
    expect(Object.keys(w.files).sort()).toEqual([
      "questionnaires/b.md",
      "transcripts/a.txt",
    ]);
    expect(w.files["transcripts/a.txt"].document_id).toBeDefined();
    expect(w.files["transcripts/a.txt"].chunk_count).toBeGreaterThan(0);
  });

  it("skips unchanged files on a second run", async () => {
    const fixedMtime = new Date("2026-05-10T00:00:00.000Z");
    writeFile("transcripts/a.txt", "body", fixedMtime);
    const { client } = makeSupabase();

    const first = await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );
    expect(first.processed).toBe(1);

    const { client: client2, log: log2 } = makeSupabase();
    // Re-set the mtime in case the watermark write touched the file's
    // sibling state on disk; only the .txt mtime matters here.
    utimesSync(join(workspace, "transcripts/a.txt"), fixedMtime, fixedMtime);

    const second = await ingestCorpus(
      { supabase: client2, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    expect(second.processed).toBe(0);
    expect(second.skipped).toBe(1);
    expect(log2.upserts).toEqual([]);
    expect(log2.chunkInserts).toEqual([]);
  });

  it("re-processes a file whose mtime changed", async () => {
    const t0 = new Date("2026-05-01T00:00:00.000Z");
    writeFile("transcripts/a.txt", "old body", t0);
    const { client } = makeSupabase();
    await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    const t1 = new Date("2026-05-15T00:00:00.000Z");
    writeFile("transcripts/a.txt", "new body", t1);

    const { client: client2, log: log2 } = makeSupabase();
    const second = await ingestCorpus(
      { supabase: client2, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    expect(second.processed).toBe(1);
    expect(second.skipped).toBe(0);
    expect(log2.upserts).toHaveLength(1);
    expect(log2.upserts[0].row.captured_at).toBe(t1.toISOString());
  });

  it("rebuild=true forces a re-run even when the watermark matches", async () => {
    const fixedMtime = new Date("2026-05-10T00:00:00.000Z");
    writeFile("transcripts/a.txt", "body", fixedMtime);
    const { client } = makeSupabase();
    await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    const { client: client2, log: log2 } = makeSupabase();
    utimesSync(join(workspace, "transcripts/a.txt"), fixedMtime, fixedMtime);
    const out = await ingestCorpus(
      { supabase: client2, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace, rebuild: true },
    );

    expect(out.processed).toBe(1);
    expect(out.skipped).toBe(0);
    expect(log2.upserts).toHaveLength(1);
  });

  it("captures per-file failures without sinking the run", async () => {
    writeFile("transcripts/good.txt", "good body");
    writeFile("transcripts/empty.txt", "   ");
    const { client } = makeSupabase();

    const out = await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );

    expect(out.processed).toBe(1);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0].relativePath).toBe("transcripts/empty.txt");

    // Successful file watermarked, failed file NOT watermarked, so a
    // retry naturally picks the failure up again.
    const w = loadWatermark(workspace);
    expect(w.files["transcripts/good.txt"]).toBeDefined();
    expect(w.files["transcripts/empty.txt"]).toBeUndefined();
  });

  it("emits onLog progress lines", async () => {
    writeFile("transcripts/a.txt", "body");
    const lines: string[] = [];
    const { client } = makeSupabase();

    await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      {
        userId: USER_ID,
        clientDir: workspace,
        onLog: (l) => lines.push(l),
      },
    );

    expect(lines.some((l) => l.includes("discovered"))).toBe(true);
    expect(lines.some((l) => l.includes("transcripts/a.txt"))).toBe(true);
    expect(lines.some((l) => l.includes("done"))).toBe(true);
  });

  it("no-op when the client dir is empty", async () => {
    const { client, log } = makeSupabase();
    const out = await ingestCorpus(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, clientDir: workspace },
    );
    expect(out.processed).toBe(0);
    expect(out.skipped).toBe(0);
    expect(out.failed).toEqual([]);
    expect(log.upserts).toEqual([]);
  });
});
