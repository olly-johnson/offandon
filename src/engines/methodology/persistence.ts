import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("methodology.persistence");

export type MethodologySupabaseClient = SupabaseClient<Database>;

/**
 * Read the user's methodology overlay content. Returns null when the
 * user has never saved one (the row simply doesn't exist), and the
 * empty string when they've explicitly cleared it. Callers can treat
 * both as "no overlay" but the distinction is preserved for clarity.
 */
export async function getUserMethodology(
  supabase: MethodologySupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_methodology")
    .select("content")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error("user_methodology select failed", {
      user_id: userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`getUserMethodology: ${error.message}`);
  }
  return data?.content ?? null;
}

/**
 * Write the user's methodology overlay. One row per user keyed on
 * user_id; upsert on conflict so the action layer doesn't have to
 * branch on "first save vs. update". Content is trimmed; blank-only
 * input becomes the empty string (effectively clearing the overlay).
 */
export async function upsertUserMethodology(
  supabase: MethodologySupabaseClient,
  args: { userId: string; content: string },
): Promise<void> {
  const content = args.content.trim();
  const { error } = await supabase
    .from("user_methodology")
    .upsert(
      { user_id: args.userId, content },
      { onConflict: "user_id" },
    );

  if (error) {
    log.error("user_methodology upsert failed", {
      user_id: args.userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`upsertUserMethodology: ${error.message}`);
  }
  log.info("user_methodology upserted", {
    user_id: args.userId,
    char_count: content.length,
  });
}
