import { NextResponse, type NextRequest } from "next/server";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("auth.callback");

/**
 * Handles the click-through from Supabase invite + magic-link emails.
 * Exchanges the one-time code for a session and routes the user into
 * onboarding (set-password first if they have no profile yet).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/onboarding/set-password";

  if (!code) {
    log.warn("callback without code", { search: url.search });
    return NextResponse.redirect(new URL("/signin?error=missing-code", url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.error("exchangeCodeForSession failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return NextResponse.redirect(new URL("/signin?error=callback-failed", url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  log.info("callback exchange ok", { user_id: user?.id, next });

  return NextResponse.redirect(new URL(next, url));
}
