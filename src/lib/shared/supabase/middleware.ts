import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { createLogger } from "@/lib/shared/logger";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

const log = createLogger("auth.middleware");

/**
 * Error codes Supabase returns when a refresh token cannot be exchanged.
 * These are EXPECTED in two scenarios:
 *   1. The refresh token has been rotated by a parallel request (browser
 *      prefetch, multiple tabs, hot-reload during dev). The first request
 *      consumed the old token; this one is racing with stale state.
 *   2. The cookie outlived the server-side session.
 *
 * In both cases the right move is to clear the dead auth cookies so the
 * browser stops retrying with them and the user sees a clean sign-in.
 * These are NOT bugs; downgrade to debug.
 */
const REFRESH_FAILURE_CODES = new Set([
  "refresh_token_already_used",
  "refresh_token_not_found",
]);

/**
 * Match the Supabase SSR cookie naming scheme: `sb-<project-ref>-auth-token`
 * plus the chunked variants `sb-<project-ref>-auth-token.0`, `.1`, etc. that
 * appear when the session payload exceeds the 4KB cookie limit.
 */
const SUPABASE_AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;

/**
 * Runs on every request. Validates the JWT, rotates the session cookie if
 * Supabase issued a refresh, and forwards the response. Page-level redirect
 * logic (sign-in vs onboarding vs dashboard) lives in the pages themselves;
 * the middleware deliberately stays cheap and never queries the database.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() is the only call here; it returns the validated user from the
  // JWT and refreshes the session cookie if needed. We do not act on the
  // result; pages decide what to do with the auth state.
  const { error } = await supabase.auth.getUser();

  if (error) {
    if (error.code && REFRESH_FAILURE_CODES.has(error.code)) {
      // Race: another request already rotated the refresh token. Clear the
      // dead cookies so the browser stops carrying them on every request.
      // The page handler will see no user and redirect to /signin, same as
      // an unauthenticated visit.
      clearAuthCookies(request, response);
      log.debug("refresh token race, cleared cookies", { code: error.code });
    } else if (error.status !== 401) {
      log.warn("getUser non-auth error", { code: error.code, status: error.status });
    }
  }

  return response;
}

function clearAuthCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (SUPABASE_AUTH_COOKIE_RE.test(cookie.name)) {
      response.cookies.delete(cookie.name);
    }
  }
}
