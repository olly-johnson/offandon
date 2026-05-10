import { SlopError, validateAntiSlop } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";

import { buildChatSystemPrompt } from "./system-prompt";
import type { ChatMessage, ChatReply, ChatReplyInput, IChatEngine } from "./types";

const log = createLogger("chat.engine");

/**
 * Multi-turn LLM client surface the Chat Engine depends on.
 *
 * Distinct from voice's `ILLMClient.complete({system, user})` because chat
 * needs the full message history. AnthropicLLMClient implements both so
 * production wiring is one client, not two.
 */
export interface IChatLLMClient {
  chat(args: { system: string; messages: ChatMessage[] }): Promise<string>;
}

export interface ChatEngineOptions {
  llm: IChatLLMClient;
  /** Override the wall clock; useful for deterministic tests. */
  now?: () => Date;
}

export class ChatEngine implements IChatEngine {
  private readonly llm: IChatLLMClient;
  private readonly now: () => Date;

  constructor(opts: ChatEngineOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async reply(input: ChatReplyInput): Promise<ChatReply> {
    if (!Array.isArray(input.history) || input.history.length === 0) {
      throw new Error("ChatEngine: history must be a non-empty array");
    }
    const last = input.history[input.history.length - 1];
    if (last.role !== "user") {
      throw new Error("ChatEngine: last message must be from the user");
    }

    const system = buildChatSystemPrompt(input.voiceDna);
    const raw = await this.llm.chat({ system, messages: input.history });

    const content = raw.trim();
    if (content.length === 0) {
      throw new Error("ChatEngine: LLM returned an empty assistant message");
    }

    const result = validateAntiSlop(content);
    if (!result.ok) {
      log.warn("assistant reply failed anti-slop", {
        violation_count: result.violations.length,
        first_type: result.violations[0]?.type,
      });
      throw new SlopError(result.violations);
    }

    return {
      message: { role: "assistant", content },
      meta: {
        generated_at: this.now().toISOString(),
        history_length: input.history.length,
      },
    };
  }
}
