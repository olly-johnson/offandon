import { describe, expect, it } from "vitest";

import { SUGGESTED_CREATORS } from "./suggested-creators";

const IG_HANDLE_RE = /^[a-z0-9._]{2,30}$/i;

describe("SUGGESTED_CREATORS", () => {
  it("has at least 6 entries so the visual grid fills out", () => {
    expect(SUGGESTED_CREATORS.length).toBeGreaterThanOrEqual(6);
  });

  it("uses valid Instagram handles (no @ prefix, IG-allowed chars only)", () => {
    for (const c of SUGGESTED_CREATORS) {
      expect(c.handle).toMatch(IG_HANDLE_RE);
      expect(c.handle.startsWith("@")).toBe(false);
    }
  });

  it("has no duplicate handles (case-insensitive)", () => {
    const lowered = SUGGESTED_CREATORS.map((c) => c.handle.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("attaches a positive follower_count to every entry", () => {
    for (const c of SUGGESTED_CREATORS) {
      expect(c.follower_count).toBeGreaterThan(0);
      expect(Number.isFinite(c.follower_count)).toBe(true);
    }
  });
});
