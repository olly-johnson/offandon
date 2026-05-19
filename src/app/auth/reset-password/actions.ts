"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.reset-password");

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export type ResetPasswordState = { error?: string };

export async function resetPassword(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = ResetPasswordSchema.safeParse({
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
  if (!user) {
    log.warn("resetPassword without user (link expired or never verified)");
    redirect("/signin?error=expired-link");
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

  log.info("password reset", { user_id: user.id });
  redirect("/dashboard");
}
