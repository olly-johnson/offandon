/**
 * Attendee → site user resolution for Fathom recordings (BO-061).
 *
 * A Fathom recording can attend multiple site users (operator + clients).
 * The mapping happens in two stages:
 *
 *   1. Collect every attendee email from the recording: calendar_invitees
 *      plus recorded_by, deduplicated and lowercased.
 *
 *   2. For each email, find any user_ids that match — either directly via
 *      auth.users.email or indirectly via public.fathom_email_aliases.
 *
 * The recording is then ingested once per matched user_id. Unmatched
 * emails are returned alongside so the backfill script can surface them
 * for manual mapping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { FathomRecording } from "./types";

const log = createLogger("fathom.mapping");

export interface ResolvedAttendee {
  email: string;
  userId: string;
}

export interface AttendeeResolution {
  matched: ResolvedAttendee[];
  unmatchedEmails: string[];
}

/**
 * Return the unique set of attendee emails on a recording. Includes every
 * calendar_invitee plus recorded_by when present. All lowercased + trimmed.
 */
export function collectAttendeeEmails(recording: FathomRecording): string[] {
  const seen = new Set<string>();
  for (const inv of recording.invitees) {
    const e = inv.email.toLowerCase().trim();
    if (e.length > 0) seen.add(e);
  }
  if (recording.recordedByEmail) {
    const e = recording.recordedByEmail.toLowerCase().trim();
    if (e.length > 0) seen.add(e);
  }
  return Array.from(seen);
}

/**
 * Lookup pipeline used by the webhook + backfill. `authUserEmailToId` is
 * the in-memory snapshot of auth.users (passed in so the caller can reuse
 * a single listUsers() call across many recordings). `supabase` is the
 * service-role client for the alias lookup.
 */
export async function resolveAttendees(
  supabase: SupabaseClient<Database>,
  authUserEmailToId: Map<string, string>,
  recording: FathomRecording,
): Promise<AttendeeResolution> {
  const emails = collectAttendeeEmails(recording);
  if (emails.length === 0) {
    return { matched: [], unmatchedEmails: [] };
  }

  // First pass: direct auth.users.email matches.
  const matchedByEmail = new Map<string, string>();
  for (const email of emails) {
    const userId = authUserEmailToId.get(email);
    if (userId) matchedByEmail.set(email, userId);
  }

  // Second pass: alias matches for any email not already resolved. A single
  // Fathom email could be aliased to multiple users (rare but possible if
  // two site users share a calendar invite address); each gets its own
  // ingest row. We deduplicate (email, user_id) pairs at the end.
  const aliasResults: ResolvedAttendee[] = [];
  const aliasLookupEmails = emails.filter((e) => !matchedByEmail.has(e));
  if (aliasLookupEmails.length > 0) {
    const { data, error } = await supabase
      .from("fathom_email_aliases")
      .select("user_id, fathom_email")
      .in("fathom_email", aliasLookupEmails);
    if (error) {
      log.error("alias lookup failed", { error: error.message });
      throw new Error(`fathom alias lookup: ${error.message}`);
    }
    for (const row of data ?? []) {
      aliasResults.push({ email: row.fathom_email, userId: row.user_id });
    }
  }

  const matchedSet = new Set<string>();
  const matched: ResolvedAttendee[] = [];
  for (const [email, userId] of matchedByEmail.entries()) {
    const key = `${email}::${userId}`;
    if (matchedSet.has(key)) continue;
    matchedSet.add(key);
    matched.push({ email, userId });
  }
  for (const r of aliasResults) {
    const key = `${r.email}::${r.userId}`;
    if (matchedSet.has(key)) continue;
    matchedSet.add(key);
    matched.push(r);
  }

  const matchedEmailSet = new Set(matched.map((m) => m.email));
  const unmatchedEmails = emails.filter((e) => !matchedEmailSet.has(e));

  return { matched, unmatchedEmails };
}

/**
 * Helper: dump auth.users emails into a Map for cheap repeated lookup.
 * Backfill calls this once and reuses across the whole run.
 */
export async function loadAuthUserEmailIndex(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const res = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (res.error) {
    throw new Error(`listUsers failed: ${res.error.message}`);
  }
  for (const u of res.data.users) {
    if (u.email) out.set(u.email.toLowerCase(), u.id);
  }
  return out;
}
