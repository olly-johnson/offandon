/**
 * Read side for the dashboard's weekly-progress card (BO-076).
 *
 * Returns the structured per-week metric rows for one user, oldest first,
 * so the pure `buildWeeklyProgress` helper can turn them into per-metric
 * series + this-week deltas. Runs under the caller's client (the
 * dashboard uses the RLS-bound server client; weekly_checkins SELECT is
 * own-rows-only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

export interface CheckinMetricsRow {
  weekStart: string;
  newFollowers: number | null;
  dmsReceived: number | null;
  callsBooked: number | null;
  salesClosed: number | null;
  leadsGenerated: number | null;
  revenue: number | null;
  postsPublished: number | null;
  satisfaction: number | null;
}

export async function listRecentCheckinMetrics(
  supabase: SupabaseClient<Database>,
  userId: string,
  limitWeeks = 12,
): Promise<CheckinMetricsRow[]> {
  const { data, error } = await supabase
    .from("weekly_checkins")
    .select(
      "week_start, new_followers, dms_received, calls_booked, sales_closed, leads_generated, revenue, posts_published, satisfaction",
    )
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(limitWeeks);

  if (error) {
    // Tolerate the migration not being applied yet (fresh env): the card
    // simply renders empty rather than 500-ing the whole dashboard.
    if (error.code === "PGRST205" || error.code === "42P01" || error.code === "42703") {
      return [];
    }
    throw new Error(`listRecentCheckinMetrics: ${error.message}`);
  }

  // Oldest first for charting.
  return (data ?? [])
    .map((r) => ({
      weekStart: r.week_start,
      newFollowers: r.new_followers,
      dmsReceived: r.dms_received,
      callsBooked: r.calls_booked,
      salesClosed: r.sales_closed,
      leadsGenerated: r.leads_generated,
      revenue: r.revenue,
      postsPublished: r.posts_published,
      satisfaction: r.satisfaction,
    }))
    .reverse();
}
