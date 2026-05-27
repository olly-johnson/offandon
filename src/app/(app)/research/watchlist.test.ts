import { describe, expect, it } from "vitest";

import type { CompetitorRow } from "@/engines/competitor";

import {
  buildOptimisticRow,
  competitorKey,
  isOptimisticId,
  mergeWatchlist,
} from "./watchlist";

function serverRow(
  partial: Partial<CompetitorRow> & { id: string; username: string },
): CompetitorRow {
  return {
    platform: "instagram",
    display_name: null,
    note: null,
    added_at: "2026-05-27T00:00:00Z",
    last_synced_at: null,
    last_sync_error: null,
    sync_pending: false,
    ...partial,
  };
}

describe("competitorKey", () => {
  it("strips a leading @ and lowercases so dedupe is case-insensitive", () => {
    expect(competitorKey("instagram", "@Hormozi")).toBe("instagram:hormozi");
    expect(competitorKey("tiktok", "GaryVee")).toBe("tiktok:garyvee");
  });
});

describe("buildOptimisticRow", () => {
  it("returns a pending row with an optimistic id", () => {
    const row = buildOptimisticRow("tiktok", "@GaryVee", new Date("2026-05-27T12:00:00Z"));
    expect(row).not.toBeNull();
    expect(row!.id).toBe("optimistic:tiktok:garyvee");
    expect(row!.username).toBe("garyvee");
    expect(row!.platform).toBe("tiktok");
    expect(row!.sync_pending).toBe(true);
    expect(isOptimisticId(row!.id)).toBe(true);
  });

  it("returns null for an empty handle", () => {
    expect(buildOptimisticRow("instagram", "   ")).toBeNull();
    expect(buildOptimisticRow("instagram", "@")).toBeNull();
  });
});

describe("isOptimisticId", () => {
  it("only flags optimistic placeholder ids", () => {
    expect(isOptimisticId("optimistic:instagram:hormozi")).toBe(true);
    expect(isOptimisticId("8f3c-real-uuid")).toBe(false);
  });
});

describe("mergeWatchlist", () => {
  it("appends optimistic adds after the server rows", () => {
    const server = [serverRow({ id: "1", username: "hormozi" })];
    const optimistic = [buildOptimisticRow("tiktok", "garyvee")!];
    const out = mergeWatchlist(server, optimistic, new Set());
    expect(out.map((r) => r.username)).toEqual(["hormozi", "garyvee"]);
  });

  it("drops an optimistic add once the real server row exists (no duplicate)", () => {
    const server = [
      serverRow({ id: "1", username: "hormozi" }),
      serverRow({ id: "2", username: "garyvee", platform: "tiktok" }),
    ];
    const optimistic = [buildOptimisticRow("tiktok", "GaryVee")!];
    const out = mergeWatchlist(server, optimistic, new Set());
    expect(out).toHaveLength(2);
    expect(out.filter((r) => r.username === "garyvee")).toHaveLength(1);
    // The surviving row is the real one, not the optimistic placeholder.
    expect(isOptimisticId(out.find((r) => r.username === "garyvee")!.id)).toBe(
      false,
    );
  });

  it("hides removed server rows", () => {
    const server = [
      serverRow({ id: "1", username: "hormozi" }),
      serverRow({ id: "2", username: "leila" }),
    ];
    const out = mergeWatchlist(server, [], new Set(["1"]));
    expect(out.map((r) => r.username)).toEqual(["leila"]);
  });

  it("hides an optimistic add that was also optimistically removed", () => {
    const optimistic = [buildOptimisticRow("instagram", "hormozi")!];
    const out = mergeWatchlist(
      [],
      optimistic,
      new Set(["optimistic:instagram:hormozi"]),
    );
    expect(out).toHaveLength(0);
  });

  it("dedupes optimistic adds that share a key", () => {
    const optimistic = [
      buildOptimisticRow("instagram", "hormozi")!,
      buildOptimisticRow("instagram", "@Hormozi")!,
    ];
    const out = mergeWatchlist([], optimistic, new Set());
    expect(out).toHaveLength(1);
  });

  it("keeps the same handle tracked on two different platforms", () => {
    const optimistic = [
      buildOptimisticRow("instagram", "garyvee")!,
      buildOptimisticRow("tiktok", "garyvee")!,
    ];
    const out = mergeWatchlist([], optimistic, new Set());
    expect(out).toHaveLength(2);
  });
});
