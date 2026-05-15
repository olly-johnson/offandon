import { describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EMBEDDING_DIMENSIONS, type IEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";
import type { VoiceDNA } from "@/engines/voice/types";

import {
  buildScriptsSeedQuery,
  DEFAULT_SCRIPTS_CORPUS_LIMIT,
  hasCorpusHits,
  loadScriptsCorpusContext,
} from "./corpus-context";

const USER_ID = "11111111-1111-1111-1111-111111111111";

const FIXTURE_DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic", "direct"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition.",
      example_topics: ["audits"],
    },
    {
      name: "Receipts and Postmortems",
      description: "Specific case studies with numbers.",
      example_topics: ["5K MRR"],
    },
  ],
  prohibited_phrases: ["delve"],
  audience_persona: {
    description: "Coaches with proof of work who want serious clients.",
    pain_points: ["Inconsistent lead flow"],
    aspirations: ["Predictable monthly revenue"],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function makeSupabase(rows: Array<Record<string, unknown>>): {
  client: SupabaseClient<Database>;
  rpcCalls: RpcCall[];
} {
  const rpcCalls: RpcCall[] = [];
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rows, error: null });
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
    async embed(texts, opts) {
      calls.push({ texts: [...texts], inputType: opts?.inputType });
      return texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1));
    },
  };
}

describe("buildScriptsSeedQuery", () => {
  it("includes the pillars and persona", () => {
    const seed = buildScriptsSeedQuery(FIXTURE_DNA);
    expect(seed).toContain("Operator Frameworks");
    expect(seed).toContain("Receipts and Postmortems");
    expect(seed).toContain("Coaches with proof of work");
  });

  it("survives a DNA with no pillars (uses persona only)", () => {
    const dna: VoiceDNA = {
      ...FIXTURE_DNA,
      content_pillars: [],
    };
    const seed = buildScriptsSeedQuery(dna);
    expect(seed).not.toContain("Content pillars:");
    expect(seed).toContain("Coaches");
  });

  it("survives a DNA with empty persona description", () => {
    const dna: VoiceDNA = {
      ...FIXTURE_DNA,
      audience_persona: { ...FIXTURE_DNA.audience_persona, description: "" },
    };
    const seed = buildScriptsSeedQuery(dna);
    expect(seed).not.toContain("Audience:");
    expect(seed).toContain("Operator Frameworks");
  });

  it("always leads with a recency-flavoured anchor sentence", () => {
    const seed = buildScriptsSeedQuery(FIXTURE_DNA);
    expect(seed.toLowerCase()).toContain("recent");
  });
});

describe("loadScriptsCorpusContext", () => {
  const SAMPLE_ROW = {
    chunk_id: "c1",
    document_id: "d1",
    chunk_index: 0,
    chunk_text: "She said her ICP is solo consultants charging $5-10K.",
    source_type: "fathom_transcript",
    document_title: "Strategy call",
    captured_at: "2026-05-10T15:00:00.000Z",
    similarity: 0.81,
  };

  it("embeds the seed with inputType=query and calls match_client_chunks", async () => {
    const { client, rpcCalls } = makeSupabase([SAMPLE_ROW]);
    const embeddings = makeEmbedder();
    const out = await loadScriptsCorpusContext(
      { supabase: client, embeddings },
      { userId: USER_ID, voiceDna: FIXTURE_DNA },
    );
    expect(embeddings.calls).toHaveLength(1);
    expect(embeddings.calls[0].inputType).toBe("query");
    expect(embeddings.calls[0].texts[0]).toContain("Operator Frameworks");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("match_client_chunks");
    expect(rpcCalls[0].args.match_user_id).toBe(USER_ID);
    expect(rpcCalls[0].args.match_count).toBe(DEFAULT_SCRIPTS_CORPUS_LIMIT);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].chunk_text).toContain("solo consultants");
  });

  it("honors a custom limit", async () => {
    const { client, rpcCalls } = makeSupabase([]);
    await loadScriptsCorpusContext(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, voiceDna: FIXTURE_DNA, limit: 3 },
    );
    expect(rpcCalls[0].args.match_count).toBe(3);
  });

  it("returns an empty hits array (not null) when the user has no corpus", async () => {
    const { client } = makeSupabase([]);
    const out = await loadScriptsCorpusContext(
      { supabase: client, embeddings: makeEmbedder() },
      { userId: USER_ID, voiceDna: FIXTURE_DNA },
    );
    expect(out.hits).toEqual([]);
  });
});

describe("hasCorpusHits", () => {
  it("false for null / undefined / empty", () => {
    expect(hasCorpusHits(null)).toBe(false);
    expect(hasCorpusHits(undefined)).toBe(false);
    expect(hasCorpusHits({ hits: [] })).toBe(false);
  });

  it("true when at least one hit", () => {
    expect(
      hasCorpusHits({
        hits: [
          {
            chunk_id: "c",
            document_id: "d",
            chunk_index: 0,
            chunk_text: "x",
            source_type: "note",
            document_title: "t",
            captured_at: "2026-01-01T00:00:00.000Z",
            similarity: 0.5,
          },
        ],
      }),
    ).toBe(true);
  });
});
