/**
 * Shape the per-week check-in metric rows into the dashboard's
 * "Your Weekly Progress" card view model (BO-076).
 *
 * For each charted metric we expose the latest week's value, the delta vs
 * the previous week, and the full series for a sparkline. Revenue is
 * captured in the DB but intentionally excluded here so it is never drawn
 * on the card.
 */

import type { CheckinMetricsRow } from "@/engines/weekly-checkin";

export interface WeeklyProgressPoint {
  weekStart: string;
  value: number | null;
}

export interface WeeklyProgressMetric {
  key: string;
  label: string;
  latest: number | null;
  previous: number | null;
  /** latest - previous, only when both weeks have a number. */
  delta: number | null;
  series: WeeklyProgressPoint[];
}

export interface WeeklyProgress {
  weeks: string[];
  metrics: WeeklyProgressMetric[];
  hasData: boolean;
}

interface MetricDef {
  key: string;
  label: string;
  get: (row: CheckinMetricsRow) => number | null;
}

// Order = display order on the card. Revenue is deliberately absent.
const METRIC_DEFS: MetricDef[] = [
  { key: "new_followers", label: "New followers", get: (r) => r.newFollowers },
  { key: "dms_received", label: "DMs received", get: (r) => r.dmsReceived },
  { key: "calls_booked", label: "Calls booked", get: (r) => r.callsBooked },
  { key: "sales_closed", label: "Sales closed", get: (r) => r.salesClosed },
  { key: "leads_generated", label: "Leads generated", get: (r) => r.leadsGenerated },
  { key: "posts_published", label: "Posts published", get: (r) => r.postsPublished },
  { key: "satisfaction", label: "Satisfaction", get: (r) => r.satisfaction },
];

/**
 * @param rows oldest-first weekly metric rows (as listRecentCheckinMetrics returns).
 */
export function buildWeeklyProgress(rows: CheckinMetricsRow[]): WeeklyProgress {
  const weeks = rows.map((r) => r.weekStart);

  const metrics: WeeklyProgressMetric[] = METRIC_DEFS.map((def) => {
    const series = rows.map((r) => ({ weekStart: r.weekStart, value: def.get(r) }));
    const latest = series.length > 0 ? series[series.length - 1].value : null;
    const previous = series.length > 1 ? series[series.length - 2].value : null;
    const delta =
      latest !== null && previous !== null ? latest - previous : null;
    return { key: def.key, label: def.label, latest, previous, delta, series };
  });

  const hasData = metrics.some((m) =>
    m.series.some((p) => p.value !== null),
  );

  return { weeks, metrics, hasData };
}
