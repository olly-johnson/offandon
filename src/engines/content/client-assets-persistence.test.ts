import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

import {
  DEFAULT_ASSET_CAPS,
  hasAnyAssets,
  loadScriptAssetsContext,
  pickPastScriptsByFramework,
} from "./client-assets-persistence";
import type { ClientAssetRow } from "./client-assets-persistence";

interface MockCalls {
  fromCalls: string[];
  filters: Array<Record<string, string>>;
  orders: Array<{ column: string; ascending: boolean }>;
  limits: number[];
}

function makeClient(
  perTypeRows: Record<string, Array<Record<string, unknown>>>,
  errorOnType?: string,
): { client: SupabaseClient<Database>; calls: MockCalls } {
  const calls: MockCalls = { fromCalls: [], filters: [], orders: [], limits: [] };

  const client = {
    from(table: string) {
      calls.fromCalls.push(table);
      let filterAssetType: string | null = null;

      const builder: Record<string, unknown> = {
        select() {
          return builder;
        },
        eq(column: string, value: string) {
          calls.filters.push({ [column]: value });
          if (column === "asset_type") filterAssetType = value;
          return builder;
        },
        order(column: string, opts: { ascending: boolean }) {
          calls.orders.push({ column, ascending: opts.ascending });
          return builder;
        },
        limit(n: number) {
          calls.limits.push(n);
          if (errorOnType && filterAssetType === errorOnType) {
            return Promise.resolve({
              data: null,
              error: { message: `forced ${errorOnType} error` },
            });
          }
          const rows = filterAssetType ? perTypeRows[filterAssetType] ?? [] : [];
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;

  return { client, calls };
}

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("loadScriptAssetsContext", () => {
  it("fetches all four asset types in parallel and groups them by type", async () => {
    const { client } = makeClient({
      story: [
        {
          asset_type: "story",
          title: "Story A",
          body: "Body A",
          metadata: { category: "rock_bottom" },
        },
      ],
      viral_reference: [
        { asset_type: "viral_reference", title: "Viral X", body: "Body X", metadata: {} },
      ],
      template: [
        { asset_type: "template", title: "Hook tpl", body: "Pattern", metadata: {} },
      ],
      past_script: [
        { asset_type: "past_script", title: "Past 1", body: "Body 1", metadata: {} },
      ],
    });

    const ctx = await loadScriptAssetsContext(client, USER_ID);

    expect(ctx.stories).toHaveLength(1);
    expect(ctx.viral_references).toHaveLength(1);
    expect(ctx.templates).toHaveLength(1);
    expect(ctx.past_scripts).toHaveLength(1);
    expect(ctx.stories[0].title).toBe("Story A");
    expect(ctx.stories[0].metadata).toEqual({ category: "rock_bottom" });
  });

  it("returns empty arrays for asset types with no rows", async () => {
    const { client } = makeClient({ story: [] });
    const ctx = await loadScriptAssetsContext(client, USER_ID);
    expect(ctx.stories).toEqual([]);
    expect(ctx.viral_references).toEqual([]);
    expect(ctx.templates).toEqual([]);
    expect(ctx.past_scripts).toEqual([]);
  });

  it("filters by user_id and asset_type on every fetch", async () => {
    const { client, calls } = makeClient({});
    await loadScriptAssetsContext(client, USER_ID);
    const userFilters = calls.filters.filter((f) => "user_id" in f).map((f) => f.user_id);
    const typeFilters = calls.filters.filter((f) => "asset_type" in f).map((f) => f.asset_type);
    expect(new Set(userFilters)).toEqual(new Set([USER_ID]));
    expect(new Set(typeFilters)).toEqual(
      new Set(["story", "viral_reference", "template", "past_script"]),
    );
  });

  it("orders by created_at desc and caps with DEFAULT_ASSET_CAPS (past_scripts over-fetched for framework grouping)", async () => {
    const { client, calls } = makeClient({});
    await loadScriptAssetsContext(client, USER_ID);
    expect(new Set(calls.orders.map((o) => o.column))).toEqual(new Set(["created_at"]));
    expect(calls.orders.every((o) => !o.ascending)).toBe(true);
    // past_scripts over-fetches 4x so the framework-grouping in
    // pickPastScriptsByFramework has enough rows to dedupe down to one
    // per framework (BO-053). Other asset_types use their caps verbatim.
    expect(new Set(calls.limits)).toEqual(
      new Set([
        DEFAULT_ASSET_CAPS.stories,
        DEFAULT_ASSET_CAPS.viral_references,
        DEFAULT_ASSET_CAPS.templates,
        DEFAULT_ASSET_CAPS.past_scripts * 4,
      ]),
    );
  });

  it("skips fetch entirely when a cap is 0", async () => {
    const { client, calls } = makeClient({});
    await loadScriptAssetsContext(client, USER_ID, {
      stories: 5,
      viral_references: 0,
      templates: 0,
      past_scripts: 0,
    });
    // Only one fetch should hit the wire.
    expect(calls.fromCalls.filter((t) => t === "client_assets")).toHaveLength(1);
  });

  it("throws on a Supabase error so the caller can surface it", async () => {
    const { client } = makeClient({}, "story");
    await expect(loadScriptAssetsContext(client, USER_ID)).rejects.toThrow(
      /loadScriptAssetsContext\(story\)/,
    );
  });

  it("defaults non-object metadata to {} rather than passing arrays/null through", async () => {
    const { client } = makeClient({
      story: [
        { asset_type: "story", title: "T", body: "B", metadata: null },
        { asset_type: "story", title: "T2", body: "B2", metadata: ["array"] },
      ],
    });
    const ctx = await loadScriptAssetsContext(client, USER_ID);
    expect(ctx.stories[0].metadata).toEqual({});
    expect(ctx.stories[1].metadata).toEqual({});
  });

  it("surfaces one of each framework first, then fills remaining slots with extras (BO-053)", async () => {
    const { client } = makeClient({
      past_script: [
        { asset_type: "past_script", title: "Hero recent", body: "h1", metadata: { framework: "Hero's Journey" } },
        { asset_type: "past_script", title: "Hero older",  body: "h2", metadata: { framework: "Hero's Journey" } },
        { asset_type: "past_script", title: "Mih recent",  body: "m1", metadata: { framework: "Man in a Hole" } },
        { asset_type: "past_script", title: "Mih older",   body: "m2", metadata: { framework: "Man in a Hole" } },
        { asset_type: "past_script", title: "Lesson",      body: "l1", metadata: { framework: "The Lesson" } },
      ],
    });
    const ctx = await loadScriptAssetsContext(client, USER_ID);
    // Round-robin: one of each framework in the first three slots, then
    // the leftovers fill remaining slots up to cap. Cap of 6 with 5 rows
    // means we get all 5 back, with each framework represented before
    // any framework gets a second example.
    const fws = ctx.past_scripts.map((p) => p.metadata.framework);
    expect(fws.slice(0, 3).sort()).toEqual([
      "Hero's Journey",
      "Man in a Hole",
      "The Lesson",
    ]);
    expect(fws).toHaveLength(5);
  });

  it("respects the pastScriptFramework filter (only matching framework returned)", async () => {
    const { client } = makeClient({
      past_script: [
        { asset_type: "past_script", title: "Hero 1", body: "h1", metadata: { framework: "Hero's Journey" } },
        { asset_type: "past_script", title: "Mih 1",  body: "m1", metadata: { framework: "Man in a Hole" } },
        { asset_type: "past_script", title: "Hero 2", body: "h2", metadata: { framework: "Hero's Journey" } },
      ],
    });
    const ctx = await loadScriptAssetsContext(client, USER_ID, {
      pastScriptFramework: "Hero's Journey",
    });
    expect(ctx.past_scripts.map((p) => p.title)).toEqual(["Hero 1", "Hero 2"]);
  });

  it("filter is case-insensitive on framework match", async () => {
    const { client } = makeClient({
      past_script: [
        { asset_type: "past_script", title: "Hero 1", body: "h1", metadata: { framework: "Hero's Journey" } },
      ],
    });
    const ctx = await loadScriptAssetsContext(client, USER_ID, {
      pastScriptFramework: "hero's journey",
    });
    expect(ctx.past_scripts).toHaveLength(1);
  });
});

describe("pickPastScriptsByFramework", () => {
  const make = (i: number, fw: string | undefined): ClientAssetRow => ({
    asset_type: "past_script",
    title: `script ${i} (${fw ?? "untagged"})`,
    body: `body ${i}`,
    metadata: fw ? { framework: fw } : {},
  });

  it("returns [] when input is empty or limit <= 0", () => {
    expect(pickPastScriptsByFramework([], 6)).toEqual([]);
    expect(pickPastScriptsByFramework([make(1, "X")], 0)).toEqual([]);
  });

  it("round-robins across frameworks (one each before second of any)", () => {
    const rows = [
      make(1, "A"),
      make(2, "A"),
      make(3, "B"),
      make(4, "B"),
      make(5, "C"),
    ];
    const out = pickPastScriptsByFramework(rows, 6);
    expect(out.map((r) => r.title)).toEqual([
      "script 1 (A)",
      "script 3 (B)",
      "script 5 (C)",
      "script 2 (A)",
      "script 4 (B)",
    ]);
  });

  it("caps at `limit` even when there's more available", () => {
    const rows = [make(1, "A"), make(2, "B"), make(3, "C"), make(4, "D")];
    const out = pickPastScriptsByFramework(rows, 2);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.metadata.framework)).toEqual(["A", "B"]);
  });

  it("pushes untagged ('_other') rows to the back of the round-robin", () => {
    const rows = [
      make(1, undefined),
      make(2, "A"),
      make(3, undefined),
      make(4, "B"),
    ];
    const out = pickPastScriptsByFramework(rows, 4);
    expect(out.map((r) => r.title)).toEqual([
      "script 2 (A)",
      "script 4 (B)",
      "script 1 (untagged)",
      "script 3 (untagged)",
    ]);
  });

  it("with frameworkFilter, returns just that bucket up to limit (case-insensitive)", () => {
    const rows = [
      make(1, "Hero's Journey"),
      make(2, "Man in a Hole"),
      make(3, "Hero's Journey"),
      make(4, "Hero's Journey"),
    ];
    const out = pickPastScriptsByFramework(rows, 2, "hero's journey");
    expect(out.map((r) => r.title)).toEqual([
      "script 1 (Hero's Journey)",
      "script 3 (Hero's Journey)",
    ]);
  });

  it("returns [] when frameworkFilter matches nothing", () => {
    const rows = [make(1, "A")];
    expect(pickPastScriptsByFramework(rows, 6, "B")).toEqual([]);
  });
});

describe("hasAnyAssets", () => {
  it("returns false for null / undefined / fully empty contexts", () => {
    expect(hasAnyAssets(null)).toBe(false);
    expect(hasAnyAssets(undefined)).toBe(false);
    expect(
      hasAnyAssets({ stories: [], viral_references: [], templates: [], past_scripts: [] }),
    ).toBe(false);
  });

  it("returns true if any asset_type has at least one row", () => {
    expect(
      hasAnyAssets({
        stories: [
          { asset_type: "story", title: "x", body: "y", metadata: {} },
        ],
        viral_references: [],
        templates: [],
        past_scripts: [],
      }),
    ).toBe(true);
  });
});

// Vi mock cleanup
vi.clearAllMocks();
