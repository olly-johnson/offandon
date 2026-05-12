import { describe, expect, it } from "vitest";

import { computeLibraryStats } from "./library-stats";

describe("computeLibraryStats", () => {
  it("returns all-nulls when fewer than 5 valid reaches", () => {
    const out = computeLibraryStats([100, 200, null, undefined]);
    expect(out.median_reach).toBeNull();
    expect(out.p20_reach).toBeNull();
    expect(out.p80_reach).toBeNull();
    expect(out.sample_size).toBe(2);
  });

  it("computes p20 / median / p80 from a clean distribution", () => {
    // 1..10; median 5.5; p20 2.8; p80 8.2 (type-7 linear interpolation)
    const out = computeLibraryStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(out.sample_size).toBe(10);
    expect(out.median_reach).toBeCloseTo(5.5);
    expect(out.p20_reach).toBeCloseTo(2.8);
    expect(out.p80_reach).toBeCloseTo(8.2);
  });

  it("ignores null / undefined / NaN / negative entries", () => {
    const out = computeLibraryStats([
      100,
      null,
      undefined,
      Number.NaN,
      -50,
      200,
      300,
      400,
      500,
    ]);
    expect(out.sample_size).toBe(5);
    expect(out.median_reach).toBe(300);
  });
});
