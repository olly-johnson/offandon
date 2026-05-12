import { describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

import {
  DEFAULT_ASSET_CAPS,
  hasAnyAssets,
  loadScriptAssetsContext,
} from "./client-assets-persistence";

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

  it("orders by created_at desc and caps with DEFAULT_ASSET_CAPS", async () => {
    const { client, calls } = makeClient({});
    await loadScriptAssetsContext(client, USER_ID);
    expect(new Set(calls.orders.map((o) => o.column))).toEqual(new Set(["created_at"]));
    expect(calls.orders.every((o) => !o.ascending)).toBe(true);
    expect(new Set(calls.limits)).toEqual(
      new Set([
        DEFAULT_ASSET_CAPS.stories,
        DEFAULT_ASSET_CAPS.viral_references,
        DEFAULT_ASSET_CAPS.templates,
        DEFAULT_ASSET_CAPS.past_scripts,
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
