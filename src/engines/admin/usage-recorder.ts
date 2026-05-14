/**
 * Build the `onUsage` callback that gets handed to `AnthropicLLMClient`.
 *
 * The callback closes over a service-role Supabase client + the call
 * site's `user_id` and `surface` label, so the LLM client itself stays
 * blissfully unaware of who's making the call or how to talk to the DB.
 * Each call site that wants usage tracked imports this and passes the
 * result through the client constructor.
 *
 * Fire-and-forget: any insert error is logged but never re-thrown.
 */

import type { UsageRecord } from "@/engines/voice/anthropic-client";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { recordApiUsage, type ApiUsageSurface } from "./usage";

export function buildUsageRecorder(args: {
  userId: string | null;
  surface: ApiUsageSurface;
}): (entry: UsageRecord) => Promise<void> {
  const admin = createSupabaseAdminClient();
  return async (entry: UsageRecord) => {
    await recordApiUsage(admin, {
      user_id: args.userId,
      surface: args.surface,
      model: entry.model,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      cache_creation_tokens: entry.cache_creation_tokens,
      cache_read_tokens: entry.cache_read_tokens,
      stop_reason: entry.stop_reason,
    });
  };
}
