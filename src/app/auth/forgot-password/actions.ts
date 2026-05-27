"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.forgot-password");

const ForgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

export type ForgotPasswordState = {
  error?: string;
  sent?: string;
};

async function siteOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * Send the user a one-time recovery link. We never tell the caller whether
 * the email matched a real account: the response is the same either way to
 * avoid account-enumeration via the public sign-in surface.
 */
export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = ForgotPasswordSchema.safeParse({
    email: (formData.get("email") ?? "").toString().trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createSupabaseServerClient();
  const origin = await siteOrigin();
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(
    "/auth/reset-password",
  )}`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo },
  );

  if (error) {
    log.warn("resetPasswordForEmail failed", {
      email: parsed.data.email,
      code: error.code,
      status: error.status,
    });
  } else {
    log.info("reset email requested", { email: parsed.data.email });
  }

  return { sent: parsed.data.email };
}
