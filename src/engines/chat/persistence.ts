import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { ChatMessage, ChatRole } from "./types";

const log = createLogger("chat.persistence");

export type ChatSupabaseClient = SupabaseClient<Database>;

const MAX_TITLE_LEN = 80;

function truncateTitle(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= MAX_TITLE_LEN) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LEN - 3)}...`;
}

/**
 * Create a new conversation row owned by the user. Title is truncated to
 * fit the list rendering. Returns the new conversation's id.
 */
export async function createConversation(
  supabase: ChatSupabaseClient,
  args: { userId: string; title: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: args.userId,
      title: truncateTitle(args.title),
    })
    .select("id")
    .single();

  if (error || !data) {
    log.error("conversations insert failed", {
      user_id: args.userId,
      code: error?.code,
      message: error?.message,
    });
    throw new Error(`createConversation: ${error?.message ?? "unknown"}`);
  }
  return data.id;
}

export interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export async function listConversationsForUser(
  supabase: ChatSupabaseClient,
  userId: string,
  limit = 30,
): Promise<ConversationRow[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listConversationsForUser: ${error.message}`);
  return (data ?? []) as ConversationRow[];
}

export interface MessageRow {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export async function getConversationWithMessages(
  supabase: ChatSupabaseClient,
  conversationId: string,
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr) throw new Error(`getConversationWithMessages: ${convErr.message}`);
  if (!conv) return null;

  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (msgErr) throw new Error(`getConversationWithMessages messages: ${msgErr.message}`);

  return {
    conversation: conv as ConversationRow,
    messages: (msgs ?? []) as MessageRow[],
  };
}

/**
 * Append one message to a conversation and bump the conversation's
 * updated_at so it sorts to the top of the list. The bump is best-effort
 * after the insert succeeds; if the bump fails we still return success
 * because the message is what the user cares about.
 */
export async function appendMessage(
  supabase: ChatSupabaseClient,
  args: {
    conversationId: string;
    userId: string;
    role: ChatRole;
    content: string;
  },
): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    conversation_id: args.conversationId,
    user_id: args.userId,
    role: args.role,
    content: args.content,
  });
  if (error) {
    log.error("messages insert failed", {
      conversation_id: args.conversationId,
      user_id: args.userId,
      role: args.role,
      code: error.code,
      message: error.message,
    });
    throw new Error(`appendMessage: ${error.message}`);
  }

  const bump = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", args.conversationId);
  if (bump.error) {
    log.warn("conversation updated_at bump failed", {
      conversation_id: args.conversationId,
      message: bump.error.message,
    });
  }
}

/** Convenience: convert MessageRow[] to the shape the engine expects. */
export function toEngineHistory(rows: MessageRow[]): ChatMessage[] {
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

/**
 * Delete a conversation owned by the caller. Messages cascade via the
 * conversation_id foreign key. RLS limits the row set to the caller's
 * own conversations, so passing an id that belongs to someone else is a
 * silent no-op (zero rows affected) rather than an error — which matches
 * how Supabase reports cross-tenant deletes via PostgREST.
 *
 * Returns the number of rows actually deleted (0 or 1). Callers can use
 * the 0-case to distinguish "not yours / does not exist" from "deleted".
 */
export async function deleteConversation(
  supabase: ChatSupabaseClient,
  conversationId: string,
): Promise<number> {
  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId);
  if (error) {
    log.error("conversation delete failed", {
      conversation_id: conversationId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`deleteConversation: ${error.message}`);
  }
  return count ?? 0;
}
