import { countInvitesByAdminSince, type AdminSupabaseClient } from "./persistence";

export type AdminInviteSupabaseClient = AdminSupabaseClient;

/**
 * Per-admin rolling invite quota. Tuned conservatively to catch a
 * hand-slip (form submitted twenty times by accident) without getting in
 * the way of a real onboarding session.
 */
export const INVITE_RATE_LIMIT_MAX = 10;
export const INVITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class InviteRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "InviteRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Throws InviteRateLimitError if the admin has already hit
 * INVITE_RATE_LIMIT_MAX invites inside the rolling window. Resolves
 * silently otherwise.
 *
 * Pass `now` explicitly so the caller can test against fixed instants
 * and the limit and DB cutoff use the same clock reading.
 */
export async function enforceInviteRateLimit(args: {
  supabase: AdminInviteSupabaseClient;
  adminId: string;
  now: Date;
}): Promise<void> {
  const since = new Date(args.now.getTime() - INVITE_RATE_LIMIT_WINDOW_MS);
  const count = await countInvitesByAdminSince(args.supabase, {
    adminId: args.adminId,
    since,
  });
  if (count >= INVITE_RATE_LIMIT_MAX) {
    throw new InviteRateLimitError(
      `Invite limit reached (${INVITE_RATE_LIMIT_MAX} per hour). Try again later.`,
      INVITE_RATE_LIMIT_WINDOW_MS,
    );
  }
}
