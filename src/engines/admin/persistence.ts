import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase/types";

export type AdminSupabaseClient = SupabaseClient<Database>;

export type AdminInviteStatus =
  | "sent"
  | "accepted"
  | "revoked"
  | "failed";

export interface AdminInviteRow {
  id: string;
  invited_by: string;
  email: string;
  status: AdminInviteStatus;
  error: string | null;
  created_at: string;
  accepted_at: string | null;
}

const log = createLogger("admin.persistence");

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Record one admin invite. Writes go through the service-role client only;
 * the table has no `authenticated` grants. Email is lower-cased before
 * insert so duplicate-by-case detection is straightforward.
 */
export async function recordInvite(
  supabase: AdminSupabaseClient,
  args: {
    invitedBy: string;
    email: string;
    status?: AdminInviteStatus;
    error?: string | null;
  },
): Promise<void> {
  const row = {
    invited_by: args.invitedBy,
    email: normaliseEmail(args.email),
    status: args.status ?? "sent",
    error: args.error ?? null,
  };
  log.debug("recordInvite", {
    invited_by: row.invited_by,
    email: row.email,
    status: row.status,
  });
  const { error } = await supabase.from("admin_invites").insert(row);
  if (error) {
    log.error("recordInvite failed", {
      message: error.message,
      code: (error as { code?: string }).code,
    });
    throw new Error(`recordInvite: ${error.message}`);
  }
}

/**
 * Return the N most-recent invites, newest first. Service-role only.
 */
export async function listRecentInvites(
  supabase: AdminSupabaseClient,
  opts: { limit?: number } = {},
): Promise<AdminInviteRow[]> {
  const limit = opts.limit ?? 20;
  const { data, error } = await supabase
    .from("admin_invites")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    log.error("listRecentInvites failed", { message: error.message });
    throw new Error(`listRecentInvites: ${error.message}`);
  }
  return (data ?? []) as AdminInviteRow[];
}

/**
 * Count successful (status = 'sent') invites this admin has issued since
 * the given cutoff. Drives the per-admin rate limit; we only count 'sent'
 * so a flurry of 'failed' rows from a misbehaving client doesn't lock the
 * admin out of retrying.
 */
export async function countInvitesByAdminSince(
  supabase: AdminSupabaseClient,
  args: { adminId: string; since: Date },
): Promise<number> {
  const { count, error } = await supabase
    .from("admin_invites")
    .select("*", { count: "exact", head: true })
    .eq("invited_by", args.adminId)
    .eq("status", "sent")
    .gte("created_at", args.since.toISOString());
  if (error) {
    log.error("countInvitesByAdminSince failed", { message: error.message });
    throw new Error(`countInvitesByAdminSince: ${error.message}`);
  }
  return count ?? 0;
}
