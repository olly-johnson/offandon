/**
 * Funnel-stage helpers for the dashboard's Trust Funnel Balance chart.
 *
 * Scripts do not yet store an explicit funnel_stage column. Until they
 * do, we derive a stage from the script's angle using the methodology's
 * structure-to-funnel mapping. When proper funnel tracking lands (the
 * Script Writer should label its own choice in BO-039), replace this
 * heuristic with the stored value.
 */

import type { ScriptAngle } from "@/engines/content/types";

export type FunnelStage = "TOF" | "MOF" | "BOF";

const ANGLE_TO_STAGE: Record<ScriptAngle, FunnelStage> = {
  // Top of funnel: emotional connection, story-led, no offer.
  story: "TOF",
  aspiration: "TOF",
  pain_point: "TOF",
  // Middle of funnel: teach with vulnerability, build authority.
  contrarian: "MOF",
  framework: "MOF",
  myth_buster: "MOF",
  // Bottom of funnel: proof, conversion.
  case_study: "BOF",
};

export function angleToFunnelStage(angle: ScriptAngle): FunnelStage {
  return ANGLE_TO_STAGE[angle];
}

export interface FunnelBalance {
  TOF: number;
  MOF: number;
  BOF: number;
  total: number;
}

/** Per the methodology (01-house.md). */
export const FUNNEL_TARGET = { TOF: 50, MOF: 35, BOF: 15 } as const;

export function computeFunnelBalance(angles: ScriptAngle[]): FunnelBalance {
  const tally: FunnelBalance = { TOF: 0, MOF: 0, BOF: 0, total: angles.length };
  for (const a of angles) {
    tally[angleToFunnelStage(a)]++;
  }
  return tally;
}

export function funnelPercentages(b: FunnelBalance): { TOF: number; MOF: number; BOF: number } {
  if (b.total === 0) return { TOF: 0, MOF: 0, BOF: 0 };
  return {
    TOF: Math.round((b.TOF / b.total) * 100),
    MOF: Math.round((b.MOF / b.total) * 100),
    BOF: Math.round((b.BOF / b.total) * 100),
  };
}
