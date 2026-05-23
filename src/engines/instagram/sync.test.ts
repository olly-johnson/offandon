import { describe, expect, it, vi } from "vitest";

import {
  InstagramApiError,
  InstagramTokenError,
  type IInstagramClient,
} from "./client";
import type { InstagramSupabaseClient } from "./persistence";
import { runInstagramSync } from "./sync";
import type {
  InstagramAccountStats,
  InstagramMediaInsights,
  InstagramMediaRecord,
} from "./types";

const NOW = new Date("2026-05-11T12:00:00.000Z");

function makeSupabaseMock(): {
  supabase: InstagramSupabaseClient;
  upsertCalls: Array<{ table: string; payload: unknown }>;
} {
  const upsertCalls: Array<{ table: string; payload: unknown }> = [];
  const supabase = {
    from(table: string) {
      return {
        upsert: (payload: unknown) => {
          upsertCalls.push({ table, payload });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as InstagramSupabaseClient;
  return { supabase, upsertCalls };
}

const STATS: InstagramAccountStats = {
  ig_user_id: "ig-1",
  username: "olly",
  followers_count: 200,
  follows_count: 100,
  media_count: 5,
};

const MEDIA: InstagramMediaRecord[] = [
  {
    id: "m1",
    media_type: "REELS",
    caption: "hi",
    permalink: "https://instagram.com/p/m1",
    media_url: null,
    thumbnail_url: "https://cdn/m1.jpg",
    posted_at: "2026-05-10T12:00:00Z",
    like_count: 12,
    comments_count: 3,
  },
];

const INSIGHTS: InstagramMediaInsights = {
  reach: 500,
  plays: 700,
  saved: 4,
  shares: 1,
};

describe("runInstagramSync", () => {
  it("happy path: pulls self + media + insights, upserts both tables", async () => {
    const { supabase, upsertCalls } = makeSupabaseMock();
    const client: IInstagramClient = {
      fetchSelf: vi.fn().mockResolvedValue(STATS),
      fetchMedia: vi.fn().mockResolvedValue(MEDIA),
      fetchMediaInsights: vi.fn().mockResolvedValue(INSIGHTS),
    };

    const result = await runInstagramSync({
      supabase,
      client,
      userId: "user-1",
      accessToken: "tok",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.mediaCount).toBe(1);
    expect(result.followersCount).toBe(200);

    expect(client.fetchSelf).toHaveBeenCalledWith("tok");
    expect(client.fetchMedia).toHaveBeenCalledWith("tok", 24);
    expect(client.fetchMediaInsights).toHaveBeenCalledWith("tok", "m1", "REELS");

    // Should have upserted media then connection.
    const tables = upsertCalls.map((c) => c.table);
    expect(tables).toContain("instagram_media");
    expect(tables).toContain("instagram_connections");

    const mediaUpsert = upsertCalls.find(
      (c) => c.table === "instagram_media",
    )!.payload as Array<Record<string, unknown>>;
    expect(mediaUpsert).toHaveLength(1);
    expect(mediaUpsert[0].id).toBe("m1");
    expect(mediaUpsert[0].reach).toBe(500);
    expect(mediaUpsert[0].plays).toBe(700);

    const connUpsert = upsertCalls.find(
      (c) => c.table === "instagram_connections",
    )!.payload as Record<string, unknown>;
    expect(connUpsert.followers_count).toBe(200);
    expect(connUpsert.last_synced_at).toBe(NOW.toISOString());
    expect(connUpsert.last_sync_error).toBeNull();

    // Daily follower snapshot for the dashboard's New Followers metric.
    const snapshot = upsertCalls.find(
      (c) => c.table === "instagram_follower_history",
    )?.payload as Record<string, unknown> | undefined;
    expect(snapshot).toBeDefined();
    expect(snapshot?.user_id).toBe("user-1");
    expect(snapshot?.captured_on).toBe("2026-05-11");
    expect(snapshot?.followers_count).toBe(200);
  });

  it("records last_sync_error on token failure and does NOT upsert media", async () => {
    const { supabase, upsertCalls } = makeSupabaseMock();
    const client: IInstagramClient = {
      fetchSelf: vi
        .fn()
        .mockRejectedValue(new InstagramTokenError("token revoked")),
      fetchMedia: vi.fn(),
      fetchMediaInsights: vi.fn(),
    };

    const result = await runInstagramSync({
      supabase,
      client,
      userId: "user-1",
      accessToken: "tok",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("token revoked");
    expect(client.fetchMedia).not.toHaveBeenCalled();

    const tables = upsertCalls.map((c) => c.table);
    expect(tables).not.toContain("instagram_media");
    const conn = upsertCalls.find(
      (c) => c.table === "instagram_connections",
    )!.payload as Record<string, unknown>;
    expect(conn.last_sync_error).toBe("token revoked");
    expect(conn.last_synced_at).toBeNull();
  });

  it("records last_sync_error on media fetch failure and skips insights", async () => {
    const { supabase, upsertCalls } = makeSupabaseMock();
    const client: IInstagramClient = {
      fetchSelf: vi.fn().mockResolvedValue(STATS),
      fetchMedia: vi
        .fn()
        .mockRejectedValue(new InstagramApiError("rate limited", 429)),
      fetchMediaInsights: vi.fn(),
    };

    const result = await runInstagramSync({
      supabase,
      client,
      userId: "user-1",
      accessToken: "tok",
      now: NOW,
    });

    expect(result.ok).toBe(false);
    expect(client.fetchMediaInsights).not.toHaveBeenCalled();
    expect(upsertCalls.map((c) => c.table)).not.toContain("instagram_media");
  });

  it("continues when ONE insights call fails (one bad apple doesn't kill the sync)", async () => {
    const { supabase, upsertCalls } = makeSupabaseMock();
    const two: InstagramMediaRecord[] = [
      MEDIA[0],
      { ...MEDIA[0], id: "m2" },
    ];
    const client: IInstagramClient = {
      fetchSelf: vi.fn().mockResolvedValue(STATS),
      fetchMedia: vi.fn().mockResolvedValue(two),
      fetchMediaInsights: vi
        .fn()
        .mockImplementationOnce(async () => INSIGHTS)
        .mockImplementationOnce(async () => {
          throw new InstagramApiError("nope", 500);
        }),
    };

    const result = await runInstagramSync({
      supabase,
      client,
      userId: "user-1",
      accessToken: "tok",
      now: NOW,
    });

    expect(result.ok).toBe(true);
    expect(result.mediaCount).toBe(2);
    const mediaUpsert = upsertCalls.find(
      (c) => c.table === "instagram_media",
    )!.payload as Array<Record<string, unknown>>;
    expect(mediaUpsert).toHaveLength(2);
    expect(mediaUpsert[0].reach).toBe(500);
    expect(mediaUpsert[1].reach).toBeNull();
    expect(mediaUpsert[1].plays).toBeNull();
  });
});
