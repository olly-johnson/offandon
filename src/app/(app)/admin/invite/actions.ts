"use server";

import { revalidatePath } from "next/cache";

import { isAdmin } from "@/engines/admin/auth";
import { recordInvite } from "@/engines/admin/persistence";
import {
  enforceInviteRateLimit,
  InviteRateLimitError,
} from "@/engines/admin/rate-limit";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("admin.invite.actions");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Feature flag. While false, the /admin/invite UI renders a "disabled"
 * notice instead of the form, and this action refuses every request as
 * a defence in depth (in case anyone POSTs the form directly).
 *
 * Flip to true to re-enable invites. No other changes needed.
 */
const INVITES_ENABLED = false;

export type InviteState = { error?: string; sent?: string };

/**
 * Send an invite email to a creator.
 *
 * Three guards before we hit Supabase:
 *   1. Signed in.
 *   2. `app_metadata.is_admin === true` (set via the auth schema, not the
 *      client SDK, so the user cannot promote themselves).
 *   3. Per-admin rolling-hour rate limit.
 *
 * The invite itself uses the service-role client because
 * `auth.admin.inviteUserByEmail` requires admin privileges. The
 * Supabase project's Site URL drives where the link in the email lands;
 * we let that config own the redirect rather than passing redirectTo so
 * the existing /auth/callback flow stays the single click-through path.
 */
export async function inviteUserAction(
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  void _prev;
  if (!INVITES_ENABLED) {
    log.warn("invite attempted while feature disabled");
    return { error: "Invites are temporarily disabled." };
  }
  const email = (form.get("email") ?? "").toString().trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  if (!isAdmin(user)) {
    log.warn("non-admin attempted invite", { user_id: user.id, email });
    return { error: "Admin access required." };
  }

  const adminClient = createSupabaseAdminClient();

  try {
    await enforceInviteRateLimit({
      supabase: adminClient,
      adminId: user.id,
      now: new Date(),
    });
  } catch (err) {
    if (err instanceof InviteRateLimitError) {
      log.warn("invite rate-limited", { user_id: user.id });
      return { error: err.message };
    }
    throw err;
  }

  const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    email,
  );
  if (inviteErr) {
    log.error("inviteUserByEmail failed", {
      user_id: user.id,
      email,
      message: inviteErr.message,
      code: (inviteErr as { code?: string }).code,
    });
    await recordInvite(adminClient, {
      invitedBy: user.id,
      email,
      status: "failed",
      error: inviteErr.message,
    }).catch((auditErr: unknown) => {
      // Audit-log failure should not eat the original error.
      log.error("recordInvite (failed) failed", {
        user_id: user.id,
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    });
    return { error: `Could not send invite: ${inviteErr.message}` };
  }

  await recordInvite(adminClient, {
    invitedBy: user.id,
    email,
    status: "sent",
  });
  log.info("invite sent", { user_id: user.id, email });

  revalidatePath("/admin/invite");
  return { sent: email };
}
