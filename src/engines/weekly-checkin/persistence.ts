/**
 * Persistence helpers for weekly_checkins.
 *
 * Service-role only — RLS gives end users SELECT on their own rows, but
 * writes go through these helpers from the webhook (admin client). The
 * (user_id, week_start) unique index guarantees a duplicate Apps Script
 * fire-on-edit doesn't insert twice; we surface the unique-violation as
 * `duplicated: true` so the webhook can return 200 idempotently rather
 * than 500-and-retry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/shared/supabase";

import type { WeeklyCheckinRow } from "./types";

export type CheckinSupabase = SupabaseClient<Database>;

export interface SaveCheckinInput {
  userId: string;
  weekStart: string;
  rawResponses: Record<string, unknown>;
  submittedAt: string;
}

export interface SaveCheckinResult {
  row: WeeklyCheckinRow | null;
  duplicated: boolean;
}

const UNIQUE_VIOLATION = "23505";

export async function saveCheckin(
  supabase: CheckinSupabase,
  input: SaveCheckinInput,
): Promise<SaveCheckinResult> {
  const { data, error } = await supabase
    .from("weekly_checkins")
    .insert({
      user_id: input.userId,
      week_start: input.weekStart,
      raw_responses: input.rawResponses as unknown as Json,
      submitted_at: input.submittedAt,
    })
    .select("id, user_id, week_start, raw_responses, submitted_at")
    .single();

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return { row: null, duplicated: true };
    }
    throw new Error(`saveCheckin: ${error.message}`);
  }

  return {
    row: {
      id: data.id,
      userId: data.user_id,
      weekStart: data.week_start,
      rawResponses: (data.raw_responses ?? {}) as Record<string, unknown>,
      submittedAt: data.submitted_at,
    },
    duplicated: false,
  };
}

/**
 * Returns the set of user IDs who have already submitted a check-in for
 * the given week_start. Used by the Saturday reminder cron to exclude
 * users who're already done.
 */
export async function getWeekSubmitters(
  supabase: CheckinSupabase,
  weekStart: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("weekly_checkins")
    .select("user_id")
    .eq("week_start", weekStart);
  if (error) {
    throw new Error(`getWeekSubmitters: ${error.message}`);
  }
  return new Set((data ?? []).map((r) => r.user_id));
}

/**
 * Returns the most recent check-in for a single user, or null if none
 * exist. Used by the voice-DNA refresh function to fold ONLY the latest
 * week into the existing folded source_answers — re-folding the full
 * history would compound prior weeks every refresh.
 */
export async function getLatestCheckinForUser(
  supabase: CheckinSupabase,
  userId: string,
): Promise<WeeklyCheckinRow | null> {
  const { data, error } = await supabase
    .from("weekly_checkins")
    .select("id, user_id, week_start, raw_responses, submitted_at")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`getLatestCheckinForUser: ${error.message}`);
  }
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    weekStart: data.week_start,
    rawResponses: (data.raw_responses ?? {}) as Record<string, unknown>,
    submittedAt: data.submitted_at,
  };
}
