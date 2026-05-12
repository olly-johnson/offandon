import { describe, expect, it, vi } from "vitest";

import { commitClientIngestion, type IngestionSupabaseClient } from "./persistence";
import type { ExtractedClientData } from "./types";

function fixtureData(): ExtractedClientData {
  return {
    profile: { display_name: "Alex Ben Shaw", handle: "alex_shaw" },
    voice_dna: {
      tone_profile: {
        primary: "grounded-direct",
        energy: "high",
        formality: "conversational",
        descriptors: ["grounded"],
      },
      content_pillars: [
        { name: "Identity", description: "Who you are.", example_topics: ["x"] },
      ],
      prohibited_phrases: ["delve"],
      audience_persona: {
        description: "Solo founders.",
        pain_points: ["Crickets"],
        aspirations: ["Inbound DMs"],
        language_register: "operator-to-operator",
      },
      generated_at: "2026-05-12T10:00:00.000Z",
      source_questionnaire_hash: "ingestion",
    },
    source_answers: {
      niche: "personal branding",
      business_description: "ABS",
      goals: ["25k followers"],
      voice_samples: ["Sample 1"],
      what_works: "Vulnerability",
      where_stuck: "Hooks",
      icp: {
        pain_points: ["No leads"],
        desires: ["Clients"],
        thoughts_at_2am: ["Am I real?"],
        internal_battles: ["Visibility fear"],
        dreams: ["One-of-one brand"],
      },
      positioning: {
        core_philosophy: "Trust currency.",
        contrarian_belief: "Posting more is not the answer.",
        differentiator: "Documenting, not teaching.",
      },
    },
    client_assets: [
      {
        asset_type: "story",
        title: "Getting Kicked Out at 16",
        body: "Hosted a party, parents kicked me out.",
        metadata: { category: "rock_bottom", funnel_fit: "top" },
        source_file: "story_bank.md#kicked-out",
      },
      {
        asset_type: "viral_reference",
        title: "Game of Life seed",
        body: "Body of seed.",
        metadata: {},
        source_file: "viral_references/seed.md",
      },
    ],
    user_memories: [
      { fact: "Building Game of Life S2", category: "ongoing_project", priority: 4 },
      { fact: "Lives in Bali", category: "creator_context", priority: 3 },
    ],
    user_methodology: "TOF CTA: 'Just the player, not the guru.'",
  };
}

interface MockState {
  voiceDnaUpdates: Array<{ filter: Record<string, unknown>; payload: Record<string, unknown> }>;
  voiceDnaInserts: Array<Record<string, unknown>>;
  profileUpserts: Array<Record<string, unknown>>;
  clientAssetsUpserts: Array<{ rows: Record<string, unknown>[]; options: Record<string, unknown> }>;
  memoryInserts: Array<Record<string, unknown>[]>;
  methodologyUpserts: Array<Record<string, unknown>>;
}

function makeClient(state: MockState): IngestionSupabaseClient {
  // Per-table mock chains. The Supabase client builder returns chainable
  // objects; each call returns the same thenable so callers can await
  // anywhere in the chain.
  function thenable(value: { error: null } = { error: null }) {
    return Promise.resolve(value);
  }

  function fromVoiceDna() {
    return {
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => ({
          is: (col2: string, val2: unknown) => {
            state.voiceDnaUpdates.push({
              filter: { [col]: val, [col2]: val2 },
              payload,
            });
            return thenable();
          },
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        state.voiceDnaInserts.push(row);
        return thenable();
      },
    };
  }

  function fromProfiles() {
    return {
      upsert: (row: Record<string, unknown>) => {
        state.profileUpserts.push(row);
        return thenable();
      },
    };
  }

  function fromClientAssets() {
    return {
      upsert: (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
        state.clientAssetsUpserts.push({ rows, options });
        return thenable();
      },
    };
  }

  function fromUserMemories() {
    return {
      insert: (rows: Record<string, unknown>[]) => {
        state.memoryInserts.push(rows);
        return thenable();
      },
    };
  }

  function fromUserMethodology() {
    return {
      upsert: (row: Record<string, unknown>) => {
        state.methodologyUpserts.push(row);
        return thenable();
      },
    };
  }

  return {
    from(table: string) {
      switch (table) {
        case "voice_dna":
          return fromVoiceDna();
        case "profiles":
          return fromProfiles();
        case "client_assets":
          return fromClientAssets();
        case "user_memories":
          return fromUserMemories();
        case "user_methodology":
          return fromUserMethodology();
        default:
          throw new Error(`unexpected table: ${table}`);
      }
    },
  } as unknown as IngestionSupabaseClient;
}

const USER_ID = "00000000-0000-0000-0000-000000000001";

describe("commitClientIngestion", () => {
  it("supersedes the active voice_dna row and inserts the new one", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
    });

    expect(state.voiceDnaUpdates).toHaveLength(1);
    expect(state.voiceDnaUpdates[0].filter).toEqual({
      user_id: USER_ID,
      superseded_at: null,
    });
    expect(state.voiceDnaUpdates[0].payload).toMatchObject({ superseded_at: expect.any(String) });

    expect(state.voiceDnaInserts).toHaveLength(1);
    expect(state.voiceDnaInserts[0]).toMatchObject({
      user_id: USER_ID,
      source_questionnaire_hash: expect.any(String),
    });
  });

  it("upserts the profile row with display_name and handle", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
    });

    expect(state.profileUpserts).toHaveLength(1);
    expect(state.profileUpserts[0]).toMatchObject({
      id: USER_ID,
      display_name: "Alex Ben Shaw",
      handle: "alex_shaw",
    });
  });

  it("upserts client_assets keyed on (user_id, source_file)", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
    });

    expect(state.clientAssetsUpserts).toHaveLength(1);
    const call = state.clientAssetsUpserts[0];
    expect(call.options).toEqual({ onConflict: "user_id,source_file" });
    expect(call.rows).toHaveLength(2);
    // The persistence layer rewrites source_file to <base>#<title-slug>
    // so multi-entry files (story_bank.md) can carry multiple unique
    // rows without colliding in the upsert batch. The LLM-provided
    // anchor (here "#kicked-out") is replaced with the deterministic
    // slug derived from the title.
    expect(call.rows[0]).toMatchObject({
      user_id: USER_ID,
      asset_type: "story",
      title: "Getting Kicked Out at 16",
      source_file: "story_bank.md#getting-kicked-out-at-16",
    });
  });

  it("composes unique source_file keys from title slug when multiple assets share a file", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    const data = fixtureData();
    // Simulate the real-world Sonnet output where every story shares the
    // same source_file path (story_bank.md) with no per-story anchor.
    data.client_assets = [
      {
        asset_type: "story",
        title: "Getting Kicked Out at 16",
        body: "Hosted a party.",
        metadata: {},
        source_file: "story_bank.md",
      },
      {
        asset_type: "story",
        title: "Father's Death at Age 10",
        body: "Father died.",
        metadata: {},
        source_file: "story_bank.md",
      },
      {
        asset_type: "story",
        title: "Six Waiter Jobs in Six Years",
        body: "Six jobs.",
        metadata: {},
        source_file: "story_bank.md",
      },
    ];

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data,
    });

    const rows = state.clientAssetsUpserts[0].rows;
    expect(rows.map((r) => r.source_file)).toEqual([
      "story_bank.md#getting-kicked-out-at-16",
      "story_bank.md#father-s-death-at-age-10",
      "story_bank.md#six-waiter-jobs-in-six-years",
    ]);
  });

  it("drops within-batch duplicates that collide on the composed key", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    const data = fixtureData();
    data.client_assets = [
      {
        asset_type: "story",
        title: "Same Title",
        body: "Body A",
        metadata: {},
        source_file: "story_bank.md",
      },
      {
        asset_type: "story",
        title: "Same Title",
        body: "Body B (duplicate slug)",
        metadata: {},
        source_file: "story_bank.md",
      },
    ];

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data,
    });

    // First-write-wins on duplicate slugs.
    expect(state.clientAssetsUpserts[0].rows).toHaveLength(1);
    expect(state.clientAssetsUpserts[0].rows[0].body).toBe("Body A");
  });

  it("inserts user_memories one row per fact", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
    });

    expect(state.memoryInserts).toHaveLength(1);
    expect(state.memoryInserts[0]).toHaveLength(2);
    expect(state.memoryInserts[0][0]).toMatchObject({
      user_id: USER_ID,
      fact: "Building Game of Life S2",
      category: "ongoing_project",
      priority: 4,
    });
  });

  it("upserts user_methodology with the consolidated overlay", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
    });

    expect(state.methodologyUpserts).toHaveLength(1);
    expect(state.methodologyUpserts[0]).toEqual({
      user_id: USER_ID,
      content: "TOF CTA: 'Just the player, not the guru.'",
    });
  });

  it("skips empty client_assets / user_memories / methodology gracefully", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    const data = fixtureData();
    data.client_assets = [];
    data.user_memories = [];
    data.user_methodology = "";

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data,
    });

    expect(state.clientAssetsUpserts).toHaveLength(0);
    expect(state.memoryInserts).toHaveLength(0);
    expect(state.methodologyUpserts).toHaveLength(0);
    expect(state.voiceDnaInserts).toHaveLength(1); // voice_dna still written
    expect(state.profileUpserts).toHaveLength(1);
  });

  it("computes a deterministic source_questionnaire_hash from source_answers", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);
    const data = fixtureData();
    // Override LLM-provided placeholder so we can verify the persistence
    // layer recomputes the hash from source_answers.
    data.voice_dna.source_questionnaire_hash = "ingestion";

    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data,
    });

    const insertedHash = state.voiceDnaInserts[0].source_questionnaire_hash as string;
    expect(insertedHash).toMatch(/^[0-9a-f]{64}$/);

    // Running again with the same source_answers must produce the same hash.
    const state2: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client2 = makeClient(state2);
    await commitClientIngestion({
      supabase: client2,
      userId: USER_ID,
      data: fixtureData(),
    });
    expect(state2.voiceDnaInserts[0].source_questionnaire_hash).toBe(insertedHash);
  });

  it("throws when voice_dna update returns a Supabase error", async () => {
    const client = {
      from: (table: string) => {
        if (table === "profiles") {
          return { upsert: () => Promise.resolve({ error: null }) };
        }
        if (table === "voice_dna") {
          return {
            update: () => ({
              eq: () => ({
                is: () => Promise.resolve({ error: { message: "permission denied" } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table in error-path test: ${table}`);
      },
    } as unknown as IngestionSupabaseClient;

    await expect(
      commitClientIngestion({
        supabase: client,
        userId: USER_ID,
        data: fixtureData(),
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("emits operator-visible logs (smoke check via injected logger)", async () => {
    const state: MockState = {
      voiceDnaUpdates: [],
      voiceDnaInserts: [],
      profileUpserts: [],
      clientAssetsUpserts: [],
      memoryInserts: [],
      methodologyUpserts: [],
    };
    const client = makeClient(state);

    const logSpy = vi.fn();
    await commitClientIngestion({
      supabase: client,
      userId: USER_ID,
      data: fixtureData(),
      onLog: logSpy,
    });

    const calls = logSpy.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("profile"),
        expect.stringContaining("voice_dna"),
        expect.stringContaining("client_assets"),
        expect.stringContaining("user_memories"),
        expect.stringContaining("user_methodology"),
      ]),
    );
  });
});
