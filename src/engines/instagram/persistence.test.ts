import { describe, expect, it, vi } from "vitest";

import {
  deleteConnection,
  getConnection,
  isConnectionFresh,
  listMediaForUser,
  upsertConnection,
  upsertMedia,
  type InstagramSupabaseClient,
} from "./persistence";

const NOW = new Date("2026-05-11T12:00:00.000Z");

describe("isConnectionFresh", () => {
  it("returns true when last_synced_at is within the cache window", () => {
    expect(
      isConnectionFresh(
        new Date("2026-05-11T06:00:00.000Z").toISOString(),
        NOW,
      ),
    ).toBe(true);
  });

  it("returns false when last_synced_at is older than the cache window", () => {
    expect(
      isConnectionFresh(
        new Date("2026-05-09T06:00:00.000Z").toISOString(),
        NOW,
      ),
    ).toBe(false);
  });

  it("returns false when last_synced_at is null", () => {
    expect(isConnectionFresh(null, NOW)).toBe(false);
  });
});

describe("getConnection", () => {
  it("returns the row when one exists", async () => {
    const row = {
      user_id: "user-1",
      access_token: "tok",
      ig_user_id: "ig-1",
      followers_count: 12,
      last_synced_at: "2026-05-11T00:00:00Z",
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    const out = await getConnection(supabase, "user-1");
    expect(out).toEqual(row);
    expect(from).toHaveBeenCalledWith("instagram_connections");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns null when no row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    expect(await getConnection(supabase, "user-1")).toBeNull();
  });
});

describe("upsertConnection", () => {
  it("upserts on user_id with all supplied fields", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    await upsertConnection(supabase, {
      userId: "user-1",
      accessToken: "tok",
      stats: {
        ig_user_id: "ig-1",
        username: "olly",
        followers_count: 100,
        follows_count: 50,
        media_count: 7,
      },
      lastSyncedAt: NOW.toISOString(),
    });

    expect(from).toHaveBeenCalledWith("instagram_connections");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        access_token: "tok",
        ig_user_id: "ig-1",
        ig_username: "olly",
        followers_count: 100,
        follows_count: 50,
        media_count: 7,
        last_synced_at: NOW.toISOString(),
        last_sync_error: null,
      },
      { onConflict: "user_id" },
    );
  });

  it("records last_sync_error when provided", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    await upsertConnection(supabase, {
      userId: "user-1",
      accessToken: "tok",
      stats: {
        ig_user_id: "ig-1",
        username: null,
        followers_count: null,
        follows_count: null,
        media_count: null,
      },
      lastSyncedAt: null,
      lastSyncError: "rate limited",
    });
    const row = upsert.mock.calls[0][0];
    expect(row.last_sync_error).toBe("rate limited");
  });
});

describe("deleteConnection", () => {
  it("deletes the row for the user (and media via FK cascade is not asserted here)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ delete: del });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    await deleteConnection(supabase, "user-1");

    expect(from).toHaveBeenCalledWith("instagram_connections");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});

describe("upsertMedia", () => {
  it("noops on an empty array", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as InstagramSupabaseClient;
    await upsertMedia(supabase, { userId: "user-1", rows: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts on id and stamps synced_at on every row", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    await upsertMedia(supabase, {
      userId: "user-1",
      now: NOW,
      rows: [
        {
          id: "m1",
          media_type: "REELS",
          caption: "hello",
          permalink: "https://instagram.com/p/m1",
          media_url: null,
          thumbnail_url: "https://cdn/m1.jpg",
          posted_at: "2026-05-10T12:00:00Z",
          like_count: 10,
          comments_count: 2,
          reach: 500,
          plays: 600,
          saved: 4,
          shares: 1,
        },
      ],
    });

    expect(from).toHaveBeenCalledWith("instagram_media");
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          id: "m1",
          user_id: "user-1",
          media_type: "REELS",
          caption: "hello",
          permalink: "https://instagram.com/p/m1",
          media_url: null,
          thumbnail_url: "https://cdn/m1.jpg",
          posted_at: "2026-05-10T12:00:00Z",
          like_count: 10,
          comments_count: 2,
          reach: 500,
          plays: 600,
          saved: 4,
          shares: 1,
          synced_at: NOW.toISOString(),
        },
      ],
      { onConflict: "id" },
    );
  });
});

describe("listMediaForUser", () => {
  it("queries by user_id, orders posted_at desc, limit applies", async () => {
    const rows = [
      {
        id: "m1",
        media_type: "REELS",
        caption: "hi",
        permalink: null,
        media_url: null,
        thumbnail_url: null,
        posted_at: "2026-05-10T12:00:00Z",
        like_count: 5,
        comments_count: 1,
        reach: 100,
        plays: 200,
        saved: 0,
        shares: 0,
        synced_at: NOW.toISOString(),
      },
    ];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi
      .fn()
      .mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const supabase = { from } as unknown as InstagramSupabaseClient;

    const out = await listMediaForUser(supabase, "user-1", 24);
    expect(out).toEqual(rows);
    expect(from).toHaveBeenCalledWith("instagram_media");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toHaveBeenCalledWith("posted_at", {
      ascending: false,
      nullsFirst: false,
    });
    expect(limit).toHaveBeenCalledWith(24);
  });
});
