/**
 * Week-start helpers (BO-057).
 *
 * The weekly check-in feature anchors a "week" to its Monday in UTC. The
 * cron jobs run at Fri 01:00 UTC (Fri 09:00 Bali, UTC+8) and Sat 01:00
 * UTC; the Apps Script webhook fires off Friday-into-Sunday submissions.
 * All of those map to the same Monday under this function, which makes
 * the (user_id, week_start) uniqueness constraint do what users expect:
 * one row per "this week".
 *
 * We treat the wall clock as UTC end-to-end. That's a small simplification
 * over a per-user timezone — acceptable since the whole cohort is on Bali
 * time today and any per-user override would land in a profiles column,
 * not in this helper.
 */

/**
 * Returns ISO date string (YYYY-MM-DD) of the Monday of the UTC week
 * containing `instant`. Sunday is treated as the END of the prior week,
 * matching the ISO week definition.
 */
export function isoWeekStart(instant: Date): string {
  const d = new Date(Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  ));
  // getUTCDay: 0=Sun, 1=Mon, ..., 6=Sat. Treat Sunday as day 7 so the
  // delta back to Monday is positive.
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}
