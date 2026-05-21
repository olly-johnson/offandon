import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.confirm");

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Server-side verifier for emailed one-time tokens (invite, magic link,
 * recovery, email-change). Uses the PKCE token_hash flow so the session
 * lands in cookies on the server, never in a URL fragment.
 *
 * The matching email template must use:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
 *
 * /auth/callback is the sibling for the OAuth-style code-exchange flow.
 *
 * `next` defaults by token type: invite/signup land on set-password,
 * recovery lands on reset-password. Callers can override via ?next=.
 */
function defaultNextFor(type: EmailOtpType | null): string {
  if (type === "recovery") return "/auth/reset-password";
  return "/onboarding/set-password";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? defaultNextFor(type);

  if (!token_hash || !type || !VALID_OTP_TYPES.has(type)) {
    log.warn("confirm missing or invalid params", {
      has_token_hash: !!token_hash,
      type,
    });
    return NextResponse.redirect(new URL("/signin?error=invalid-link", url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    log.error("verifyOtp failed", {
      type,
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return NextResponse.redirect(new URL("/signin?error=expired-link", url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  log.info("confirm ok", { user_id: user?.id, type, next });

  return NextResponse.redirect(new URL(next, url));
}
