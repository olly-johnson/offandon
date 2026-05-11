/**
 * Chat Engine: public type surface.
 *
 * The Chat Engine produces conversational replies grounded in the user's
 * Voice DNA. It does not own persistence (see persistence.ts) or message
 * ordering (the caller passes a complete history each turn).
 */

import type { MemoryRow } from "@/engines/memory/persistence";
import type { VoiceDNA } from "@/engines/voice/types";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * A tool the engine can hand to the LLM. The `handler` runs on our side once
 * the model emits a tool_use block; whatever string it returns is sent back
 * to the model as a tool_result for the next round-trip.
 */
export interface ChatToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: Record<string, unknown>) => Promise<string>;
}

export interface ChatReplyInput {
  voiceDna: VoiceDNA;
  /**
   * Full conversation history in chronological order. Must end with a `user`
   * message. The engine injects the system prompt itself; do not include
   * a system message here.
   */
  history: ChatMessage[];
  /** Optional tool defs the model can call during this turn. */
  tools?: ChatToolDefinition[];
  /**
   * Optional Haiku-extracted memories about this user. Rendered into the
   * system prompt so the assistant can reference ongoing projects, stated
   * preferences, etc. without the user re-stating them every turn.
   */
  memories?: MemoryRow[];
  /**
   * Optional per-user methodology overlay (BO-036). Plain text the creator
   * wrote in /methodology. Stacks on top of the house methodology + slices.
   */
  userMethodology?: string | null;
}

export interface ChatToolAction {
  name: string;
  input: Record<string, unknown>;
  /** Whatever the handler returned. Passed back to the model as tool_result. */
  result: string;
}

export interface ChatReply {
  /** The final assistant message to append to the conversation. */
  message: ChatMessage;
  meta: {
    /** ISO-8601, stamped at engine return time. */
    generated_at: string;
    /** Number of history messages the engine saw, including the latest user turn. */
    history_length: number;
  };
  /** Every tool call the engine executed during this reply, in order. */
  tool_actions: ChatToolAction[];
}

export interface IChatEngine {
  /**
   * Generate the next assistant reply for `input.history`.
   * Throws SlopError if the assistant content violates the Humanization Manifesto.
   */
  reply(input: ChatReplyInput): Promise<ChatReply>;
}
