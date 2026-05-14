import { describe, expect, it, vi } from "vitest";

import {
  computeCostUsd,
  recordApiUsage,
  summariseUsage,
  type ApiUsageRow,
  type ApiUsageSurface,
} from "./usage";
import type { AdminSupabaseClient } from "./persistence";

describe("computeCostUsd", () => {
  it("prices Sonnet 4.6 input + output + cache reads + cache writes", () => {
    // 1M input @ $3, 1M output @ $15
    const cost = computeCostUsd({
      model: "claude-sonnet-4-6",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
    });
    expect(cost).toBeCloseTo(18, 4);
  });

  it("prices Haiku 4.5 (cheaper)", () => {
    const cost = computeCostUsd({
      model: "claude-haiku-4-5-20251001",
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
    });
    // 1M input @ $1, 1M output @ $5
    expect(cost).toBeCloseTo(6, 4);
  });

  it("applies the 1.25x markup for cache writes on Sonnet", () => {
    const cost = computeCostUsd({
      model: "claude-sonnet-4-6",
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 1_000_000,
      cache_read_tokens: 0,
    });
    expect(cost).toBeCloseTo(3.75, 4);
  });

  it("applies the 0.1x discount for cache reads on Sonnet", () => {
    const cost = computeCostUsd({
      model: "claude-sonnet-4-6",
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.3, 4);
  });

  it("returns 0 for unknown models (avoids inventing a number)", () => {
    expect(
      computeCostUsd({
        model: "claude-future-99",
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
      }),
    ).toBe(0);
  });
});

describe("recordApiUsage", () => {
  function makeClient(insertResult: { error: { message: string } | null }) {
    const insert = vi.fn().mockResolvedValue(insertResult);
    const from = vi.fn().mockReturnValue({ insert });
    return { client: { from } as unknown as AdminSupabaseClient, insert, from };
  }

  it("inserts a normalised row with the provided fields", async () => {
    const { client, from, insert } = makeClient({ error: null });

    await recordApiUsage(client, {
      user_id: "u-1",
      surface: "chat",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 0,
      cache_read_tokens: 200,
      stop_reason: "end_turn",
    });

    expect(from).toHaveBeenCalledWith("api_usage");
    expect(insert).toHaveBeenCalledWith({
      user_id: "u-1",
      surface: "chat",
      model: "claude-sonnet-4-6",
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 0,
      cache_read_tokens: 200,
      stop_reason: "end_turn",
    });
  });

  it("defaults the four token counts to 0 and passes nulls for missing user_id/stop_reason", async () => {
    const { client, insert } = makeClient({ error: null });

    await recordApiUsage(client, {
      user_id: null,
      surface: "voice_dna",
      model: "claude-sonnet-4-6",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: null,
      surface: "voice_dna",
      model: "claude-sonnet-4-6",
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      stop_reason: null,
    });
  });

  it("does NOT throw when the insert fails (logging is best-effort, must not block the user)", async () => {
    const { client } = makeClient({ error: { message: "rls denied" } });

    await expect(
      recordApiUsage(client, {
        user_id: "u-1",
        surface: "chat",
        model: "claude-sonnet-4-6",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("summariseUsage", () => {
  const rows: ApiUsageRow[] = [
    row("u-1", "chat", "claude-sonnet-4-6", { input: 100, output: 50, cache_read: 200 }),
    row("u-1", "chat", "claude-sonnet-4-6", { input: 150, output: 80, cache_read: 0 }),
    row("u-2", "voice_dna", "claude-sonnet-4-6", { input: 500, output: 300 }),
    row(null, "media_analysis", "claude-sonnet-4-6", { input: 1000, output: 200 }),
  ];

  it("aggregates totals across every row", () => {
    const s = summariseUsage(rows);
    expect(s.total_input_tokens).toBe(1750);
    expect(s.total_output_tokens).toBe(630);
    expect(s.total_cache_read_tokens).toBe(200);
    expect(s.row_count).toBe(4);
    expect(s.total_cost_usd).toBeGreaterThan(0);
  });

  it("groups per user (null user_id rolled up into 'system')", () => {
    const s = summariseUsage(rows);
    const u1 = s.by_user.find((u) => u.user_id === "u-1");
    const u2 = s.by_user.find((u) => u.user_id === "u-2");
    const sys = s.by_user.find((u) => u.user_id === null);
    expect(u1?.input_tokens).toBe(250);
    expect(u1?.output_tokens).toBe(130);
    expect(u2?.input_tokens).toBe(500);
    expect(sys?.input_tokens).toBe(1000);
  });

  it("groups per surface", () => {
    const s = summariseUsage(rows);
    const chat = s.by_surface.find((r) => r.surface === "chat");
    const va = s.by_surface.find((r) => r.surface === "voice_dna");
    expect(chat?.row_count).toBe(2);
    expect(chat?.input_tokens).toBe(250);
    expect(va?.row_count).toBe(1);
  });
});

function row(
  user_id: string | null,
  surface: ApiUsageSurface,
  model: string,
  tokens: { input?: number; output?: number; cache_create?: number; cache_read?: number },
): ApiUsageRow {
  return {
    id: cryptoId(),
    user_id,
    surface,
    model,
    input_tokens: tokens.input ?? 0,
    output_tokens: tokens.output ?? 0,
    cache_creation_tokens: tokens.cache_create ?? 0,
    cache_read_tokens: tokens.cache_read ?? 0,
    stop_reason: "end_turn",
    created_at: "2026-05-14T00:00:00Z",
  };
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2);
}
