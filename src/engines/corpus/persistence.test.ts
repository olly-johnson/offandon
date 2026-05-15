import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";
import { EMBEDDING_DIMENSIONS } from "@/lib/shared/embeddings";

import { replaceDocumentChunks, saveClientDocument } from "./persistence";
import type { ClientDocumentChunkInput } from "./types";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DOC_ID = "22222222-2222-2222-2222-222222222222";

interface SupabaseCallLog {
  fromTables: string[];
  upserts: Array<{ row: Record<string, unknown>; onConflict?: string }>;
  inserts: Array<Record<string, unknown> | Array<Record<string, unknown>>>;
  deletes: Array<{ column: string; value: string }>;
}

interface MockOpts {
  upsertResult?: { data: unknown; error: { message: string } | null };
  insertResult?: { data: unknown; error: { message: string } | null };
  deleteResult?: { error: { message: string } | null };
}

function makeMockClient(opts: MockOpts = {}): {
  client: SupabaseClient<Database>;
  log: SupabaseCallLog;
} {
  const log: SupabaseCallLog = {
    fromTables: [],
    upserts: [],
    inserts: [],
    deletes: [],
  };

  const builderFor = () => {
    const builder: Record<string, unknown> = {
      upsert(row: Record<string, unknown>, options?: { onConflict?: string }) {
        log.upserts.push({ row, onConflict: options?.onConflict });
        return {
          select() {
            return {
              single: async () => opts.upsertResult ?? { data: row, error: null },
            };
          },
        };
      },
      insert(rows: Record<string, unknown> | Array<Record<string, unknown>>) {
        log.inserts.push(rows);
        // .insert() chains:
        //   - persistence insert path (single row) chains .select().single()
        //   - chunks path (array of rows) is awaited directly
        return {
          select() {
            return {
              single: async () =>
                opts.insertResult ?? { data: rows, error: null },
            };
          },
          then(resolve: (v: { data: unknown; error: unknown }) => void) {
            resolve(opts.insertResult ?? { data: rows, error: null });
          },
        };
      },
      delete() {
        return {
          eq(column: string, value: string) {
            log.deletes.push({ column, value });
            return Promise.resolve(opts.deleteResult ?? { error: null });
          },
        };
      },
    };
    return builder;
  };

  const client = {
    from(table: string) {
      log.fromTables.push(table);
      return builderFor();
    },
  } as unknown as SupabaseClient<Database>;

  return { client, log };
}

const VALID_VEC = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);

describe("saveClientDocument", () => {
  it("upserts on (user_id, source_path) when source_path is provided", async () => {
    const { client, log } = makeMockClient({
      upsertResult: {
        data: {
          id: DOC_ID,
          user_id: USER_ID,
          source_type: "fathom_transcript",
          title: "Strategy call",
          body: "Full transcript body",
          captured_at: "2026-05-01T15:00:00.000Z",
          source_path: "clients/sarah/transcripts/2026-05-01.txt",
          metadata: { duration_min: 45 },
        },
        error: null,
      },
    });

    const doc = await saveClientDocument(client, {
      user_id: USER_ID,
      source_type: "fathom_transcript",
      title: "Strategy call",
      body: "Full transcript body",
      captured_at: "2026-05-01T15:00:00.000Z",
      source_path: "clients/sarah/transcripts/2026-05-01.txt",
      metadata: { duration_min: 45 },
    });

    expect(log.fromTables).toEqual(["client_documents"]);
    expect(log.upserts).toHaveLength(1);
    expect(log.upserts[0].onConflict).toBe("user_id,source_path");
    expect(log.upserts[0].row.source_type).toBe("fathom_transcript");
    expect(doc.id).toBe(DOC_ID);
    expect(doc.source_path).toBe("clients/sarah/transcripts/2026-05-01.txt");
  });

  it("plain-inserts when source_path is null/absent", async () => {
    const { client, log } = makeMockClient({
      insertResult: {
        data: {
          id: DOC_ID,
          user_id: USER_ID,
          source_type: "note",
          title: "Pasted note",
          body: "Body",
          captured_at: "2026-05-15T00:00:00.000Z",
          source_path: null,
          metadata: {},
        },
        error: null,
      },
    });
    const doc = await saveClientDocument(client, {
      user_id: USER_ID,
      source_type: "note",
      title: "Pasted note",
      body: "Body",
    });
    expect(log.upserts).toHaveLength(0);
    expect(log.inserts).toHaveLength(1);
    expect(doc.source_path).toBeNull();
  });

  it("surfaces upsert errors", async () => {
    const { client } = makeMockClient({
      upsertResult: { data: null, error: { message: "constraint x" } },
    });
    await expect(
      saveClientDocument(client, {
        user_id: USER_ID,
        source_type: "questionnaire",
        title: "Weekly form 2026-W20",
        body: "body",
        source_path: "x",
      }),
    ).rejects.toThrow(/constraint x/);
  });

  it("defaults metadata to {} when omitted", async () => {
    const { client, log } = makeMockClient();
    await saveClientDocument(client, {
      user_id: USER_ID,
      source_type: "note",
      title: "t",
      body: "b",
    });
    const inserted = log.inserts[0] as Record<string, unknown>;
    expect(inserted.metadata).toEqual({});
  });
});

describe("replaceDocumentChunks", () => {
  it("deletes existing chunks then inserts new ones", async () => {
    const { client, log } = makeMockClient();
    const chunks: ClientDocumentChunkInput[] = [
      {
        document_id: DOC_ID,
        user_id: USER_ID,
        chunk_index: 0,
        chunk_text: "First chunk text",
        embedding: VALID_VEC,
      },
      {
        document_id: DOC_ID,
        user_id: USER_ID,
        chunk_index: 1,
        chunk_text: "Second chunk text",
        embedding: VALID_VEC,
      },
    ];
    await replaceDocumentChunks(client, DOC_ID, chunks);

    expect(log.deletes).toEqual([{ column: "document_id", value: DOC_ID }]);
    expect(log.inserts).toHaveLength(1);
    const inserted = log.inserts[0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(2);
    expect(typeof inserted[0].embedding).toBe("string");
    expect((inserted[0].embedding as string).startsWith("[")).toBe(true);
    expect((inserted[0].embedding as string).endsWith("]")).toBe(true);
  });

  it("rejects an embedding with the wrong dimension", async () => {
    const { client } = makeMockClient();
    const bad: ClientDocumentChunkInput[] = [
      {
        document_id: DOC_ID,
        user_id: USER_ID,
        chunk_index: 0,
        chunk_text: "x",
        embedding: [0.1, 0.2, 0.3],
      },
    ];
    await expect(replaceDocumentChunks(client, DOC_ID, bad)).rejects.toThrow(
      /dimension/,
    );
  });

  it("rejects a chunk whose document_id does not match the call's documentId", async () => {
    const { client } = makeMockClient();
    const bad: ClientDocumentChunkInput[] = [
      {
        document_id: "another-doc",
        user_id: USER_ID,
        chunk_index: 0,
        chunk_text: "x",
        embedding: VALID_VEC,
      },
    ];
    await expect(replaceDocumentChunks(client, DOC_ID, bad)).rejects.toThrow(
      /document_id/,
    );
  });

  it("still wipes existing chunks even when given an empty list (no insert)", async () => {
    const { client, log } = makeMockClient();
    await replaceDocumentChunks(client, DOC_ID, []);
    expect(log.deletes).toEqual([{ column: "document_id", value: DOC_ID }]);
    expect(log.inserts).toHaveLength(0);
  });

  it("surfaces delete errors", async () => {
    const { client } = makeMockClient({
      deleteResult: { error: { message: "del failed" } },
    });
    await expect(
      replaceDocumentChunks(client, DOC_ID, [
        {
          document_id: DOC_ID,
          user_id: USER_ID,
          chunk_index: 0,
          chunk_text: "x",
          embedding: VALID_VEC,
        },
      ]),
    ).rejects.toThrow(/del failed/);
  });

  it("surfaces insert errors", async () => {
    const { client } = makeMockClient({
      insertResult: { data: null, error: { message: "ins failed" } },
    });
    await expect(
      replaceDocumentChunks(client, DOC_ID, [
        {
          document_id: DOC_ID,
          user_id: USER_ID,
          chunk_index: 0,
          chunk_text: "x",
          embedding: VALID_VEC,
        },
      ]),
    ).rejects.toThrow(/ins failed/);
  });
});
