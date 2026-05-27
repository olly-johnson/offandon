import { describe, expect, it } from "vitest";

import {
  buildFormulaMatrix,
  type FormulaInputRow,
} from "./formula-matrix";

function row(p: Partial<FormulaInputRow>): FormulaInputRow {
  return {
    source: p.source ?? "own",
    format: p.format ?? "Reel",
    hook: p.hook ?? null,
    topic: p.topic ?? null,
    performanceScore: p.performanceScore ?? null,
    outlierRatio: p.outlierRatio ?? null,
    viewCount: p.viewCount ?? null,
    caption: p.caption ?? null,
    permalink: p.permalink ?? null,
    competitorUsername: p.competitorUsername ?? null,
  };
}

describe("buildFormulaMatrix", () => {
  it("returns empty dimensions and a null formula with no rows", () => {
    const m = buildFormulaMatrix([]);
    expect(m.formats).toEqual([]);
    expect(m.topics).toEqual([]);
    expect(m.hooks).toEqual([]);
    expect(m.formula).toBeNull();
    expect(m.sampleSize).toBe(0);
  });

  it("ranks formats by average score, not by row count", () => {
    const m = buildFormulaMatrix([
      row({ format: "Carousel", topic: "Growth", hook: "h", performanceScore: 90 }),
      row({ format: "Reel", topic: "Growth", hook: "h", performanceScore: 40 }),
      row({ format: "Reel", topic: "Growth", hook: "h", performanceScore: 40 }),
      row({ format: "Reel", topic: "Growth", hook: "h", performanceScore: 40 }),
    ]);
    expect(m.formats[0].label).toBe("Carousel");
    expect(m.formats[0].score).toBe(90);
    expect(m.formats[1].label).toBe("Reel");
    expect(m.formats[1].sampleSize).toBe(3);
    expect(m.sampleSize).toBe(4);
  });

  it("lets a trending competitor outlier outrank a mid-performing own topic", () => {
    const m = buildFormulaMatrix([
      row({ source: "own", topic: "A", format: "Reel", hook: "h", performanceScore: 50 }),
      row({
        source: "competitor",
        topic: "B",
        format: "Reel",
        hook: "h",
        performanceScore: 50,
        outlierRatio: 5,
      }),
    ]);
    // A scores 0.50; B blends perf 0.50 with a maxed trend signal -> 0.75.
    expect(m.topics[0].label).toBe("B");
    expect(m.topics[0].score).toBe(75);
    expect(m.topics[1].label).toBe("A");
  });

  it("surfaces the highest-scoring hook as the top exemplar and drops null hooks", () => {
    const m = buildFormulaMatrix([
      row({ hook: "Stop scrolling", topic: "Growth", performanceScore: 90 }),
      row({ hook: "Three things", topic: "Growth", performanceScore: 30 }),
      row({ hook: null, topic: "Growth", performanceScore: 99 }),
    ]);
    expect(m.hooks[0].hook).toBe("Stop scrolling");
    expect(m.hooks.map((h) => h.hook)).not.toContain(null);
    expect(m.hooks).toHaveLength(2);
  });

  it("caps the hook exemplar list and dedupes identical hook text keeping the best score", () => {
    const m = buildFormulaMatrix([
      row({ hook: "A", topic: "Growth", performanceScore: 80 }),
      row({ hook: "A", topic: "Growth", performanceScore: 40 }),
      row({ hook: "B", topic: "Growth", performanceScore: 70 }),
      row({ hook: "C", topic: "Growth", performanceScore: 60 }),
      row({ hook: "D", topic: "Growth", performanceScore: 50 }),
    ]);
    expect(m.hooks).toHaveLength(3);
    const a = m.hooks.find((h) => h.hook === "A");
    expect(a?.score).toBe(80);
  });

  it("combines the top format, topic and hook into one suggested formula", () => {
    const m = buildFormulaMatrix([
      row({ format: "Reel", topic: "Growth", hook: "Stop scrolling", performanceScore: 95 }),
      row({ format: "Carousel", topic: "Money", hook: "Do this", performanceScore: 20 }),
    ]);
    expect(m.formula).not.toBeNull();
    expect(m.formula?.format).toBe("Reel");
    expect(m.formula?.topic).toBe("Growth");
    expect(m.formula?.hook).toBe("Stop scrolling");
    expect(m.formula?.rationale).toContain("Reel");
    expect(m.formula?.rationale).toContain("Growth");
  });

  it("excludes rows with no performance or trend signal from the averages", () => {
    const m = buildFormulaMatrix([
      row({ format: "Reel", topic: "Growth", hook: "h", performanceScore: 80 }),
      row({ format: "Reel", topic: "Growth", hook: "h" }), // no signal at all
    ]);
    expect(m.formats[0].score).toBe(80);
    expect(m.formats[0].sampleSize).toBe(1);
    expect(m.sampleSize).toBe(1);
  });

  it("returns a null formula when a whole dimension is missing", () => {
    const m = buildFormulaMatrix([
      row({ format: "Reel", topic: null, hook: "h", performanceScore: 70 }),
      row({ format: "Reel", topic: null, hook: "h", performanceScore: 60 }),
    ]);
    expect(m.formats.length).toBeGreaterThan(0);
    expect(m.topics).toEqual([]);
    expect(m.formula).toBeNull();
  });

  it("tracks every source that contributed to a dimension", () => {
    const m = buildFormulaMatrix([
      row({ source: "own", format: "Reel", topic: "Growth", hook: "h", performanceScore: 60 }),
      row({
        source: "competitor",
        format: "Reel",
        topic: "Growth",
        hook: "h",
        performanceScore: 60,
      }),
    ]);
    expect(m.formats[0].sources).toContain("own");
    expect(m.formats[0].sources).toContain("competitor");
    expect(m.formats[0].sources).toHaveLength(2);
  });
});
