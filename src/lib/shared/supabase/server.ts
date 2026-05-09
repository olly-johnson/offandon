import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Server-side Supabase client for the Next 16 App Router.
 *
 * Reads the user session from cookies. Safe to call from server components,
 * route handlers, and server actions. The setAll path is a try/catch
 * because writing cookies is only allowed in route handlers and server
 * actions; middleware handles the actual session refresh.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component context; middleware refreshes the
          // session, so swallowing this is the supported pattern.
        }
      },
    },
  });
}
