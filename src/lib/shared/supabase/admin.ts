import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Service-role Supabase client.
 *
 * Bypasses RLS. Only use it from contexts that have NO end-user JWT and
 * therefore cannot rely on RLS policies for authorisation:
 *   - Inngest workers (background jobs)
 *   - Cron jobs
 *   - Programmatic admin endpoints (BO-013)
 *
 * NEVER instantiate this in:
 *   - Client components (the key would leak to the browser)
 *   - Server components or route handlers that should be acting on behalf
 *     of the signed-in user (use createSupabaseServerClient instead so
 *     RLS does its job)
 *
 * The function still requires the caller to provide a `user_id` argument
 * everywhere a row needs scoping. Service role removes the RLS guard;
 * application code is the only safety net left.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY env var. Required for service-role contexts (Inngest workers, cron). Server-only; never expose to the browser.",
    );
  }
  return createClient<Database>(supabaseUrl(), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
