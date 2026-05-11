import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("content.ideas-persistence");

export type ContentSupabaseClient = SupabaseClient<Database>;

export type IdeaSource = "chat" | "manual";

export interface SaveIdeaArgs {
  userId: string;
  content: string;
  source: IdeaSource;
  /** Optional conversation that triggered the capture (chat source). */
  conversationId?: string;
  /** Optional message that triggered the capture (chat source). */
  messageId?: string;
  /** Optional pillar tag the model attached. Free-form; may not match any current pillar. */
  pillar?: string;
}

/**
 * Persist one idea. Returns the new row's id.
 *
 * The supplied content is trimmed; a blank string after trimming throws
 * before any DB call so we never hit the table's not-blank check at
 * runtime (cheaper, clearer error).
 */
export async function saveIdea(
  supabase: ContentSupabaseClient,
  args: SaveIdeaArgs,
): Promise<string> {
  const content = args.content.trim();
  if (content.length === 0) {
    throw new Error("saveIdea: content is empty after trim");
  }

  const { data, error } = await supabase
    .from("ideas")
    .insert({
      user_id: args.userId,
      content,
      source: args.source,
      conversation_id: args.conversationId ?? null,
      message_id: args.messageId ?? null,
      pillar: args.pillar ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error("ideas insert failed", {
      user_id: args.userId,
      source: args.source,
      code: error?.code,
      message: error?.message,
    });
    throw new Error(`saveIdea: ${error?.message ?? "unknown"}`);
  }
  return data.id;
}

export interface IdeaRow {
  id: string;
  content: string;
  pillar: string | null;
  source: IdeaSource;
  conversation_id: string | null;
  message_id: string | null;
  created_at: string;
}

/**
 * Read a user's ideas, newest first.
 */
export async function listIdeasForUser(
  supabase: ContentSupabaseClient,
  userId: string,
  limit = 50,
): Promise<IdeaRow[]> {
  const { data, error } = await supabase
    .from("ideas")
    .select("id, content, pillar, source, conversation_id, message_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listIdeasForUser: ${error.message}`);
  return (data ?? []) as IdeaRow[];
}
