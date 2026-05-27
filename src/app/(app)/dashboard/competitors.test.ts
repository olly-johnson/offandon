import { describe, expect, it } from "vitest";

import type { CompetitorRow } from "@/engines/competitor";

import { summariseCompetitors } from "./competitors";

function comp(p: Partial<CompetitorRow>): CompetitorRow {
  return {
    id: p.id ?? "id-1",
    username: p.username ?? "creator",
    platform: p.platform ?? "instagram",
    display_name: p.display_name ?? null,
    note: p.note ?? null,
    added_at: p.added_at ?? "2026-05-01T00:00:00Z",
    last_synced_at: p.last_synced_at ?? null,
    last_sync_error: p.last_sync_error ?? null,
    sync_pending: p.sync_pending ?? false,
  };
}

const now = new Date("2026-05-27T12:00:00Z");

describe("summariseCompetitors", () => {
  it("reports an empty summary when nothing is tracked", () => {
    const s = summariseCompetitors([], now);
    expect(s.count).toBe(0);
    expect(s.items).toEqual([]);
    expect(s.limit).toBe(5);
  });

  it("maps handle and platform label for each tracked account", () => {
    const s = summariseCompetitors(
      [
        comp({ id: "a", username: "alice", platform: "instagram" }),
        comp({ id: "b", username: "bob", platform: "tiktok" }),
      ],
      now,
    );
    expect(s.count).toBe(2);
    expect(s.items.map((i) => i.handle)).toEqual(["alice", "bob"]);
    expect(s.items[0].platformLabel).toBe("Instagram");
    expect(s.items[1].platformLabel).toBe("TikTok");
  });

  it("treats an in-flight sync as syncing, ahead of any prior state", () => {
    const s = summariseCompetitors(
      [
        comp({
          sync_pending: true,
          last_sync_error: "boom",
          last_synced_at: "2026-05-27T10:00:00Z",
        }),
      ],
      now,
    );
    expect(s.items[0].status).toBe("syncing");
    expect(s.items[0].statusLabel).toMatch(/sync/i);
  });

  it("flags a failed last run, even when an older sync succeeded", () => {
    const s = summariseCompetitors(
      [
        comp({
          sync_pending: false,
          last_sync_error: "Apify run failed",
          last_synced_at: "2026-05-20T10:00:00Z",
        }),
      ],
      now,
    );
    expect(s.items[0].status).toBe("failed");
  });

  it("reports a relative time for a clean successful sync", () => {
    const s = summariseCompetitors(
      [comp({ last_synced_at: "2026-05-27T10:00:00Z" })], // 2h before now
      now,
    );
    expect(s.items[0].status).toBe("synced");
    expect(s.items[0].statusLabel).toBe("Synced 2h ago");
  });

  it("marks a never-synced account distinctly from a synced one", () => {
    const s = summariseCompetitors([comp({ last_synced_at: null })], now);
    expect(s.items[0].status).toBe("never");
    expect(s.items[0].statusLabel).toBe("Not synced yet");
  });

  it("formats recent, minute, and day-scale sync ages", () => {
    const s = summariseCompetitors(
      [
        comp({ id: "s", last_synced_at: "2026-05-27T11:59:30Z" }), // 30s
        comp({ id: "m", last_synced_at: "2026-05-27T11:55:00Z" }), // 5m
        comp({ id: "d", last_synced_at: "2026-05-24T12:00:00Z" }), // 3d
      ],
      now,
    );
    expect(s.items[0].statusLabel).toBe("Synced just now");
    expect(s.items[1].statusLabel).toBe("Synced 5m ago");
    expect(s.items[2].statusLabel).toBe("Synced 3d ago");
  });
});
