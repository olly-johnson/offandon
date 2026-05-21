"use server";

import { z } from "zod";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("settings.change-password");

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export type ChangePasswordState = { error?: string; ok?: true };

/**
 * Re-verify the user's current password (via signInWithPassword) before
 * updating to a new one. Supabase's updateUser does not require the old
 * password, so we add this step ourselves so a stolen session cookie alone
 * cannot rotate the password.
 */
export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { error: "Sign in first." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) {
    log.warn("current password verify failed", {
      user_id: user.id,
      code: verifyError.code,
      status: verifyError.status,
    });
    return { error: "Current password is incorrect." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    log.error("updateUser failed", {
      user_id: user.id,
      code: error.code,
      status: error.status,
    });
    return { error: "Could not update password. Try again." };
  }

  log.info("password changed", { user_id: user.id });
  return { ok: true };
}
