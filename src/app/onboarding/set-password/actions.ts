"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createLogger } from "@/lib/shared/logger";
import { hasVoiceDna } from "@/lib/shared/onboarding";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.set-password");

const SetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match.",
    path: ["confirm"],
  });

export type SetPasswordState = { error?: string };

export async function setPassword(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = SetPasswordSchema.safeParse({
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
    log.warn("setPassword without user");
    redirect("/signin");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log.error("updateUser failed", {
      user_id: user.id,
      code: error.code,
      status: error.status,
    });
    return { error: "Could not set password. Try again." };
  }

  log.info("password set", { user_id: user.id });
  // BO-042: operator-ingested users already have voice_dna populated, so
  // the wizard has nothing to collect. Send them straight to /dashboard.
  // The hasVoiceDna call uses the same Supabase server client (with the
  // freshly-updated session cookies).
  let skipWizard = false;
  try {
    skipWizard = await hasVoiceDna(supabase, user.id);
  } catch (err) {
    log.warn("hasVoiceDna check failed; falling back to /onboarding", {
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  redirect(skipWizard ? "/dashboard" : "/onboarding");
}
