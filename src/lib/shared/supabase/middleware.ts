import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { createLogger } from "@/lib/shared/logger";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

const log = createLogger("auth.middleware");

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
  if (error && error.status !== 401) {
    log.warn("getUser non-auth error", { code: error.code, status: error.status });
  }

  return response;
}
