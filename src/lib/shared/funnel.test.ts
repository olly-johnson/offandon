import { describe, expect, it } from "vitest";

import {
  angleToFunnelStage,
  computeFunnelBalance,
  funnelPercentages,
  FUNNEL_TARGET,
} from "./funnel";

describe("angleToFunnelStage", () => {
  it("maps storytelling angles to TOF", () => {
    expect(angleToFunnelStage("story")).toBe("TOF");
    expect(angleToFunnelStage("aspiration")).toBe("TOF");
    expect(angleToFunnelStage("pain_point")).toBe("TOF");
  });

  it("maps teaching angles to MOF", () => {
    expect(angleToFunnelStage("contrarian")).toBe("MOF");
    expect(angleToFunnelStage("framework")).toBe("MOF");
    expect(angleToFunnelStage("myth_buster")).toBe("MOF");
  });

  it("maps proof angles to BOF", () => {
    expect(angleToFunnelStage("case_study")).toBe("BOF");
  });
});

describe("computeFunnelBalance", () => {
  it("tallies angles by funnel stage", () => {
    const b = computeFunnelBalance(["story", "story", "framework", "case_study"]);
    expect(b).toEqual({ TOF: 2, MOF: 1, BOF: 1, total: 4 });
  });

  it("returns all zeros for an empty list", () => {
    expect(computeFunnelBalance([])).toEqual({ TOF: 0, MOF: 0, BOF: 0, total: 0 });
  });
});

describe("funnelPercentages", () => {
  it("rounds to whole percent", () => {
    const p = funnelPercentages({ TOF: 5, MOF: 3, BOF: 2, total: 10 });
    expect(p).toEqual({ TOF: 50, MOF: 30, BOF: 20 });
  });

  it("returns zero percentages when total is zero", () => {
    expect(funnelPercentages({ TOF: 0, MOF: 0, BOF: 0, total: 0 })).toEqual({
      TOF: 0,
      MOF: 0,
      BOF: 0,
    });
  });
});

describe("FUNNEL_TARGET", () => {
  it("matches the methodology in 01-house.md (50/35/15)", () => {
    expect(FUNNEL_TARGET.TOF).toBe(50);
    expect(FUNNEL_TARGET.MOF).toBe(35);
    expect(FUNNEL_TARGET.BOF).toBe(15);
    expect(FUNNEL_TARGET.TOF + FUNNEL_TARGET.MOF + FUNNEL_TARGET.BOF).toBe(100);
  });
});
