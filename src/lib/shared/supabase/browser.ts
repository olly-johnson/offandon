import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "./env";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Singleton-on-import is fine; the underlying
 * library guards against duplicate auth listeners in the same tab.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
