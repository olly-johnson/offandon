/**
 * Recipient resolver for the weekly check-in crons.
 *
 * Joins `profiles` (must have data_policy_accepted = true) against
 * `auth.users` (for email + admin flag) and returns one row per active
 * non-admin user with a real email address. Admins are excluded — they're
 * operators, not creators, and we don't want them on the cohort blast.
 *
 * Pulls up to 1000 users per page (Supabase ceiling). At the current
 * cohort size that's a single request; if/when we cross 1000 we'll need
 * to page. Marked with TODO.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { Recipient } from "./types";

const log = createLogger("weekly-checkin.recipients");

export type WeeklyCheckinSupabase = SupabaseClient<Database>;

export async function listRecipients(
  supabase: WeeklyCheckinSupabase,
): Promise<Recipient[]> {
  const [profilesRes, usersRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("data_policy_accepted", true),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (profilesRes.error) {
    throw new Error(`listRecipients.profiles: ${profilesRes.error.message}`);
  }
  if (usersRes.error) {
    throw new Error(`listRecipients.users: ${usersRes.error.message}`);
  }

  const profileById = new Map<string, { display_name: string | null }>();
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, { display_name: p.display_name });
  }

  const recipients: Recipient[] = [];
  for (const u of usersRes.data?.users ?? []) {
    const profile = profileById.get(u.id);
    if (!profile) continue;
    const meta = (u as { app_metadata?: Record<string, unknown> | null })
      .app_metadata;
    if (meta?.is_admin === true) continue;
    if (!u.email) continue;
    recipients.push({
      userId: u.id,
      email: u.email,
      displayName: profile.display_name,
    });
  }

  log.info("recipients resolved", {
    profiles: profilesRes.data?.length ?? 0,
    auth_users: usersRes.data?.users?.length ?? 0,
    recipients: recipients.length,
  });
  return recipients;
}
