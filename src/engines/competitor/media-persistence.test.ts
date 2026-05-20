import { describe, expect, it, vi } from "vitest";

import type { CompetitorReel } from "./scraper";
import {
  listMediaForCompetitor,
  upsertCompetitorMedia,
  updateCompetitorSyncState,
  type CompetitorSupabaseClient,
} from "./media-persistence";

const NOW = new Date("2026-05-20T00:00:00.000Z");

function reel(overrides: Partial<CompetitorReel> = {}): CompetitorReel {
  return {
    id: "Cxyz",
    media_type: "REELS",
    caption: "hello",
    permalink: "https://www.instagram.com/reel/Cxyz/",
    media_url: "https://cdn/v.mp4",
    thumbnail_url: "https://cdn/v.jpg",
    posted_at: "2026-05-18T00:00:00Z",
    like_count: 10,
    comments_count: 2,
    view_count: 200,
    duration_seconds: 40,
    ...overrides,
  };
}

describe("upsertCompetitorMedia", () => {
  it("noops on an empty array", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as CompetitorSupabaseClient;
    await upsertCompetitorMedia(supabase, {
      competitorId: "c1",
      userId: "u1",
      scrapeRunId: "run-1",
      reels: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts on id with denormalised competitor_id + user_id + run id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await upsertCompetitorMedia(supabase, {
      competitorId: "c1",
      userId: "u1",
      scrapeRunId: "run-1",
      now: NOW,
      reels: [reel({ id: "Cabc" }), reel({ id: "Cdef", media_url: null })],
    });

    expect(from).toHaveBeenCalledWith("competitor_media");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsert.mock.calls[0];
    expect(opts).toEqual({ onConflict: "id" });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "Cabc",
      competitor_id: "c1",
      user_id: "u1",
      scrape_run_id: "run-1",
      synced_at: NOW.toISOString(),
    });
    expect(rows[1]).toMatchObject({ id: "Cdef", media_url: null });
  });

  it("propagates upsert errors", async () => {
    const upsert = vi
      .fn()
      .mockResolvedValue({ error: { code: "42501", message: "rls" } });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await expect(
      upsertCompetitorMedia(supabase, {
        competitorId: "c1",
        userId: "u1",
        scrapeRunId: "run-1",
        reels: [reel()],
      }),
    ).rejects.toThrow(/upsertCompetitorMedia/);
  });
});

describe("listMediaForCompetitor", () => {
  it("queries by competitor_id, ordered posted_at desc", async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await listMediaForCompetitor(supabase, "c1", 30);

    expect(from).toHaveBeenCalledWith("competitor_media");
    expect(eq).toHaveBeenCalledWith("competitor_id", "c1");
    expect(order).toHaveBeenCalledWith("posted_at", {
      ascending: false,
      nullsFirst: false,
    });
    expect(limit).toHaveBeenCalledWith(30);
  });
});

describe("updateCompetitorSyncState", () => {
  it("updates last_synced_at + last_sync_error on success", async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await updateCompetitorSyncState(supabase, {
      competitorId: "c1",
      userId: "u1",
      lastSyncedAt: NOW.toISOString(),
      lastSyncError: null,
    });

    expect(from).toHaveBeenCalledWith("competitor_accounts");
    expect(update).toHaveBeenCalledWith({
      last_synced_at: NOW.toISOString(),
      last_sync_error: null,
    });
    expect(eqId).toHaveBeenCalledWith("id", "c1");
    expect(eqUser).toHaveBeenCalledWith("user_id", "u1");
  });

  it("records last_sync_error and clears last_synced_at on failure", async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const update = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ update });
    const supabase = { from } as unknown as CompetitorSupabaseClient;

    await updateCompetitorSyncState(supabase, {
      competitorId: "c1",
      userId: "u1",
      lastSyncedAt: null,
      lastSyncError: "out of credit",
    });
    expect(update).toHaveBeenCalledWith({
      last_synced_at: null,
      last_sync_error: "out of credit",
    });
  });
});
