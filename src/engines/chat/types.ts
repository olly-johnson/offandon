/**
 * Chat Engine: public type surface.
 *
 * The Chat Engine produces conversational replies grounded in the user's
 * Voice DNA. It does not own persistence (see persistence.ts) or message
 * ordering (the caller passes a complete history each turn).
 */

import type { VoiceDNA } from "@/engines/voice/types";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatReplyInput {
  voiceDna: VoiceDNA;
  /**
   * Full conversation history in chronological order. Must end with a `user`
   * message. The engine injects the system prompt itself; do not include
   * a system message here.
   */
  history: ChatMessage[];
}

export interface ChatReply {
  /** The assistant message to append to the conversation. */
  message: ChatMessage;
  meta: {
    /** ISO-8601, stamped at engine return time. */
    generated_at: string;
    /** Number of history messages the engine saw, including the latest user turn. */
    history_length: number;
  };
}

export interface IChatEngine {
  /**
   * Generate the next assistant reply for `input.history`.
   * Throws SlopError if the assistant content violates the Humanization Manifesto.
   */
  reply(input: ChatReplyInput): Promise<ChatReply>;
}
