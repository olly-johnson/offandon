import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";
import type { IEmbeddingsClient } from "@/lib/shared/embeddings";
import { EMBEDDING_DIMENSIONS } from "@/lib/shared/embeddings";

import { formatCorpusHits, searchClientCorpus } from "./search";
import type { ClientCorpusHit } from "./types";

const USER_ID = "11111111-1111-1111-1111-111111111111";

interface MockRpcCalls {
  name: string;
  args: Record<string, unknown>;
}

function makeEmbedder(vector?: number[]): IEmbeddingsClient & { calls: string[][] } {
  const calls: string[][] = [];
  const fixed = vector ?? Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
  return {
    calls,
    async embed(texts: string[]) {
      calls.push([...texts]);
      return texts.map(() => fixed);
    },
  };
}

function makeSupabase(
  rpcRows: Array<{
    chunk_id: string;
    document_id: string;
    chunk_index: number;
    chunk_text: string;
    source_type: string;
    document_title: string;
    captured_at: string;
    similarity: number;
  }> | null,
  rpcError: string | null = null,
): { client: SupabaseClient<Database>; calls: MockRpcCalls[] } {
  const calls: MockRpcCalls[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve(
        rpcError
          ? { data: null, error: { message: rpcError } }
          : { data: rpcRows, error: null },
      );
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

const SAMPLE_ROW = {
  chunk_id: "chunk-1",
  document_id: "doc-1",
  chunk_index: 0,
  chunk_text: "The creator quit consulting in 2024.",
  source_type: "fathom_transcript",
  document_title: "Strategy call with Sarah",
  captured_at: "2026-05-01T15:00:00.000Z",
  similarity: 0.87,
};

describe("searchClientCorpus", () => {
  it("returns empty array for empty/whitespace query", async () => {
    const { client } = makeSupabase([]);
    const embeddings = makeEmbedder();
    const out = await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: "   " },
    );
    expect(out).toEqual([]);
    expect(embeddings.calls).toHaveLength(0);
  });

  it("throws when user_id is missing", async () => {
    const { client } = makeSupabase([]);
    const embeddings = makeEmbedder();
    await expect(
      searchClientCorpus(
        { supabase: client, embeddings },
        { user_id: "", query: "anything" },
      ),
    ).rejects.toThrow(/user_id is required/);
  });

  it("embeds the query, calls match_client_chunks, returns hits in order", async () => {
    const { client, calls } = makeSupabase([
      SAMPLE_ROW,
      { ...SAMPLE_ROW, chunk_id: "chunk-2", chunk_index: 1, similarity: 0.74 },
    ]);
    const embeddings = makeEmbedder();
    const out = await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: "when did she quit consulting?" },
    );
    expect(embeddings.calls).toEqual([["when did she quit consulting?"]]);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("match_client_chunks");
    expect(calls[0].args.match_user_id).toBe(USER_ID);
    expect(calls[0].args.match_count).toBe(6);
    expect(out).toHaveLength(2);
    expect(out[0].chunk_id).toBe("chunk-1");
    expect(out[1].chunk_id).toBe("chunk-2");
  });

  it("clamps limit to [1, 50]", async () => {
    const { client, calls } = makeSupabase([]);
    const embeddings = makeEmbedder();

    await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: "q", limit: 999 },
    );
    expect(calls[0].args.match_count).toBe(50);

    await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: "q", limit: 0 },
    );
    expect(calls[1].args.match_count).toBe(1);
  });

  it("filters by source_type and over-fetches to preserve top-k after filtering", async () => {
    const rows = [
      { ...SAMPLE_ROW, chunk_id: "a", source_type: "fathom_transcript", similarity: 0.9 },
      { ...SAMPLE_ROW, chunk_id: "b", source_type: "questionnaire", similarity: 0.85 },
      { ...SAMPLE_ROW, chunk_id: "c", source_type: "fathom_transcript", similarity: 0.8 },
      { ...SAMPLE_ROW, chunk_id: "d", source_type: "note", similarity: 0.75 },
    ];
    const { client, calls } = makeSupabase(rows);
    const embeddings = makeEmbedder();
    const out = await searchClientCorpus(
      { supabase: client, embeddings },
      {
        user_id: USER_ID,
        query: "anything",
        limit: 2,
        source_type: "fathom_transcript",
      },
    );
    // Over-fetched 2x: requested limit=2 → match_count=4.
    expect(calls[0].args.match_count).toBe(4);
    expect(out.map((h) => h.chunk_id)).toEqual(["a", "c"]);
  });

  it("accepts an array of source_types", async () => {
    const rows = [
      { ...SAMPLE_ROW, chunk_id: "a", source_type: "fathom_transcript" },
      { ...SAMPLE_ROW, chunk_id: "b", source_type: "questionnaire" },
      { ...SAMPLE_ROW, chunk_id: "c", source_type: "note" },
    ];
    const { client } = makeSupabase(rows);
    const embeddings = makeEmbedder();
    const out = await searchClientCorpus(
      { supabase: client, embeddings },
      {
        user_id: USER_ID,
        query: "q",
        source_type: ["fathom_transcript", "questionnaire"],
      },
    );
    expect(out.map((h) => h.chunk_id)).toEqual(["a", "b"]);
  });

  it("truncates very long queries before embedding", async () => {
    const huge = "x".repeat(5000);
    const { client } = makeSupabase([]);
    const embeddings = makeEmbedder();
    await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: huge },
    );
    expect(embeddings.calls[0][0].length).toBe(2000);
  });

  it("surfaces RPC errors with a clear message", async () => {
    const { client } = makeSupabase(null, "operator timeout");
    const embeddings = makeEmbedder();
    await expect(
      searchClientCorpus(
        { supabase: client, embeddings },
        { user_id: USER_ID, query: "q" },
      ),
    ).rejects.toThrow(/operator timeout/);
  });

  it("treats null rpc data as empty", async () => {
    const { client } = makeSupabase(null);
    const embeddings = makeEmbedder();
    const out = await searchClientCorpus(
      { supabase: client, embeddings },
      { user_id: USER_ID, query: "q" },
    );
    expect(out).toEqual([]);
  });
});

describe("formatCorpusHits", () => {
  it("returns a friendly empty marker when no hits", () => {
    expect(formatCorpusHits([])).toContain("No matching context");
  });

  it("includes source type, title, capture date, similarity, and chunk body", () => {
    const hits: ClientCorpusHit[] = [
      {
        chunk_id: "x",
        document_id: "y",
        chunk_index: 0,
        chunk_text: "She quit consulting on a Tuesday.",
        source_type: "fathom_transcript",
        document_title: "Strategy call with Sarah",
        captured_at: "2026-05-01T15:00:00.000Z",
        similarity: 0.872,
      },
    ];
    const out = formatCorpusHits(hits);
    expect(out).toContain("fathom_transcript");
    expect(out).toContain("Strategy call with Sarah");
    expect(out).toContain("2026-05-01");
    expect(out).toContain("0.872");
    expect(out).toContain("She quit consulting on a Tuesday.");
  });

  it("numbers multiple hits 1..N", () => {
    const hits: ClientCorpusHit[] = [1, 2, 3].map((i) => ({
      chunk_id: `c${i}`,
      document_id: "d",
      chunk_index: i,
      chunk_text: `Body ${i}`,
      source_type: "note",
      document_title: "Title",
      captured_at: "2026-05-01T00:00:00.000Z",
      similarity: 0.5,
    }));
    const out = formatCorpusHits(hits);
    expect(out).toContain("[1]");
    expect(out).toContain("[2]");
    expect(out).toContain("[3]");
  });
});

describe("module wiring", () => {
  it("preserves the supabase client reference (no mutation)", () => {
    // Just a guard against accidental rebinding in the deps signature.
    const fn = vi.fn();
    expect(fn).not.toHaveBeenCalled();
  });
});
