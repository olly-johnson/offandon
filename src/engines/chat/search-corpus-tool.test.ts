import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EMBEDDING_DIMENSIONS, type IEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import {
  buildSearchCorpusTool,
  SEARCH_CLIENT_CORPUS_TOOL_LIMIT,
  SEARCH_CLIENT_CORPUS_TOOL_NAME,
  VALID_CORPUS_SOURCES,
} from "./search-corpus-tool";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const SAMPLE_RPC_ROW = {
  chunk_id: "chunk-1",
  document_id: "doc-1",
  chunk_index: 0,
  chunk_text: "The creator left her consulting job in 2024.",
  source_type: "fathom_transcript",
  document_title: "Strategy call with Sarah",
  captured_at: "2026-05-01T15:00:00.000Z",
  similarity: 0.87,
};

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function makeSupabase(opts: {
  rows?: Array<Record<string, unknown>> | null;
  rpcError?: string;
}): { client: SupabaseClient<Database>; rpcCalls: RpcCall[] } {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve(
        opts.rpcError
          ? { data: null, error: { message: opts.rpcError } }
          : { data: opts.rows ?? [], error: null },
      );
    },
  } as unknown as SupabaseClient<Database>;
  return { client, rpcCalls };
}

function makeEmbedder(): IEmbeddingsClient & {
  calls: Array<{ texts: string[]; inputType?: string }>;
} {
  const calls: Array<{ texts: string[]; inputType?: string }> = [];
  return {
    calls,
    async embed(texts: string[], opts?: { inputType?: "document" | "query" }) {
      calls.push({ texts: [...texts], inputType: opts?.inputType });
      return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1));
    },
  };
}

describe("buildSearchCorpusTool — definition", () => {
  it("exposes a tool named search_client_corpus", () => {
    const { client } = makeSupabase({});
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    expect(tool.name).toBe(SEARCH_CLIENT_CORPUS_TOOL_NAME);
    expect(tool.name).toBe("search_client_corpus");
  });

  it("requires the `query` field and lists the source_type enum", () => {
    const { client } = makeSupabase({});
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    expect(tool.input_schema.required).toContain("query");
    expect(tool.input_schema.properties.query).toBeDefined();
    expect(tool.input_schema.properties.source_type).toBeDefined();
    expect(
      (tool.input_schema.properties.source_type as { enum: string[] }).enum,
    ).toEqual(VALID_CORPUS_SOURCES);
  });

  it("description steers the model away from generic / history-answerable questions", () => {
    const { client } = makeSupabase({});
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    expect(tool.description.toLowerCase()).toContain("do not call");
    expect(tool.description).toContain("Fathom");
    expect(tool.description).toContain("questionnaire");
  });
});

describe("buildSearchCorpusTool — handler happy path", () => {
  it("calls searchClientCorpus with the right user_id + limit + (no) source filter", async () => {
    const { client, rpcCalls } = makeSupabase({ rows: [SAMPLE_RPC_ROW] });
    const embeddings = makeEmbedder();
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings,
      userId: USER_ID,
    });

    const out = await tool.handler({ query: "when did she quit consulting?" });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("match_client_chunks");
    expect(rpcCalls[0].args.match_user_id).toBe(USER_ID);
    expect(rpcCalls[0].args.match_count).toBe(SEARCH_CLIENT_CORPUS_TOOL_LIMIT);
    expect(embeddings.calls).toHaveLength(1);
    expect(embeddings.calls[0].inputType).toBe("query");
    expect(out).toContain("fathom_transcript");
    expect(out).toContain("Strategy call with Sarah");
    expect(out).toContain("The creator left her consulting job in 2024.");
  });

  it("forwards a valid source_type to the corpus search", async () => {
    const { client, rpcCalls } = makeSupabase({
      rows: [
        SAMPLE_RPC_ROW,
        {
          ...SAMPLE_RPC_ROW,
          chunk_id: "c2",
          source_type: "questionnaire",
          document_title: "Weekly form 2026-W20",
          chunk_text: "Q3 goal: ship paid tier by end of August.",
        },
      ],
    });
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });

    const out = await tool.handler({
      query: "Q3 goals",
      source_type: "questionnaire",
    });

    // searchClientCorpus over-fetches 2x when a source_type filter is set,
    // so match_count should be 12, not 6.
    expect(rpcCalls[0].args.match_count).toBe(SEARCH_CLIENT_CORPUS_TOOL_LIMIT * 2);
    expect(out).toContain("questionnaire");
    expect(out).toContain("Weekly form 2026-W20");
    // The fathom_transcript hit gets filtered out post-RPC.
    expect(out).not.toContain("Strategy call with Sarah");
    expect(out).not.toContain("fathom_transcript");
  });

  it("returns the empty-corpus marker when no chunks match", async () => {
    const { client } = makeSupabase({ rows: [] });
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    const out = await tool.handler({ query: "anything" });
    expect(out).toMatch(/no matching context/i);
  });
});

describe("buildSearchCorpusTool — input validation + error paths", () => {
  it("returns an error message when query is empty/whitespace, never hitting the API", async () => {
    const { client, rpcCalls } = makeSupabase({});
    const embeddings = makeEmbedder();
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings,
      userId: USER_ID,
    });

    const out1 = await tool.handler({ query: "" });
    const out2 = await tool.handler({ query: "   " });
    const out3 = await tool.handler({});

    expect(out1).toMatch(/empty/i);
    expect(out2).toMatch(/empty/i);
    expect(out3).toMatch(/empty/i);
    expect(rpcCalls).toHaveLength(0);
    expect(embeddings.calls).toHaveLength(0);
  });

  it("silently drops an invalid source_type instead of forwarding it", async () => {
    const { client, rpcCalls } = makeSupabase({ rows: [SAMPLE_RPC_ROW] });
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });

    await tool.handler({ query: "x", source_type: "BOGUS" });

    // No filter applied: match_count is the unfiltered limit, not 2x.
    expect(rpcCalls[0].args.match_count).toBe(SEARCH_CLIENT_CORPUS_TOOL_LIMIT);
  });

  it("swallows a corpus error and returns a tool_result string the model can keep going with", async () => {
    const { client } = makeSupabase({ rpcError: "rpc kaboom" });
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    const out = await tool.handler({ query: "anything" });
    expect(out).toMatch(/error searching corpus/i);
    expect(out).toContain("rpc kaboom");
  });

  it("treats a non-string query as missing rather than crashing", async () => {
    const { client, rpcCalls } = makeSupabase({});
    const tool = buildSearchCorpusTool({
      supabase: client,
      embeddings: makeEmbedder(),
      userId: USER_ID,
    });
    const out = await tool.handler({ query: 42 as unknown as string });
    expect(out).toMatch(/empty/i);
    expect(rpcCalls).toHaveLength(0);
  });
});
