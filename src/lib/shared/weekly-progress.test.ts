import { describe, expect, it } from "vitest";

import type { CheckinMetricsRow } from "@/engines/weekly-checkin";

import { buildWeeklyProgress } from "./weekly-progress";

function row(
  weekStart: string,
  partial: Partial<CheckinMetricsRow> = {},
): CheckinMetricsRow {
  return {
    weekStart,
    newFollowers: null,
    dmsReceived: null,
    callsBooked: null,
    salesClosed: null,
    leadsGenerated: null,
    revenue: null,
    postsPublished: null,
    satisfaction: null,
    ...partial,
  };
}

describe("buildWeeklyProgress", () => {
  it("computes latest, previous and delta per metric", () => {
    const out = buildWeeklyProgress([
      row("2026-05-18", { dmsReceived: 4 }),
      row("2026-05-25", { dmsReceived: 7 }),
    ]);
    const dms = out.metrics.find((m) => m.key === "dms_received")!;
    expect(dms.latest).toBe(7);
    expect(dms.previous).toBe(4);
    expect(dms.delta).toBe(3);
    expect(dms.series.map((p) => p.value)).toEqual([4, 7]);
  });

  it("never includes revenue as a charted metric", () => {
    const out = buildWeeklyProgress([row("2026-05-25", { revenue: 1200 })]);
    expect(out.metrics.find((m) => m.key === "revenue")).toBeUndefined();
  });

  it("leaves delta null when either week is missing a number", () => {
    const out = buildWeeklyProgress([
      row("2026-05-18", { callsBooked: null }),
      row("2026-05-25", { callsBooked: 2 }),
    ]);
    const calls = out.metrics.find((m) => m.key === "calls_booked")!;
    expect(calls.latest).toBe(2);
    expect(calls.previous).toBeNull();
    expect(calls.delta).toBeNull();
  });

  it("delta of a single week is null (nothing to compare to)", () => {
    const out = buildWeeklyProgress([row("2026-05-25", { salesClosed: 1 })]);
    const sales = out.metrics.find((m) => m.key === "sales_closed")!;
    expect(sales.latest).toBe(1);
    expect(sales.delta).toBeNull();
  });

  it("reports hasData false when every value across weeks is null", () => {
    expect(buildWeeklyProgress([row("2026-05-25")]).hasData).toBe(false);
    expect(buildWeeklyProgress([]).hasData).toBe(false);
  });

  it("reports hasData true when any metric has any value", () => {
    expect(
      buildWeeklyProgress([row("2026-05-25", { newFollowers: 240 })]).hasData,
    ).toBe(true);
  });

  it("exposes the week labels in order", () => {
    const out = buildWeeklyProgress([row("2026-05-18"), row("2026-05-25")]);
    expect(out.weeks).toEqual(["2026-05-18", "2026-05-25"]);
  });
});
