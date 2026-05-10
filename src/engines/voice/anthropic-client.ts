import Anthropic from "@anthropic-ai/sdk";

import type { IChatLLMClient } from "@/engines/chat/chat-engine";
import type { ChatMessage } from "@/engines/chat/types";
import { createLogger, timed } from "@/lib/shared/logger";

import type { ILLMClient } from "./voice";

const log = createLogger("voice.anthropic");

/**
 * Pinned in AGENTS.md / CLAUDE.md as the primary LLM. If you upgrade,
 * update both docs and the test fixtures.
 */
export const VOICE_DNA_MODEL = "claude-sonnet-4-6";

/**
 * Generous cap. Voice DNA JSON sits well under 1k tokens; the headroom is
 * for slow-typing models and any future schema growth.
 */
export const VOICE_DNA_MAX_TOKENS = 2048;

export interface AnthropicLLMClientOptions {
  /** Override the SDK client (used by tests). */
  client?: Anthropic;
  /** Override API key (defaults to ANTHROPIC_API_KEY env). */
  apiKey?: string;
  /** Override model id (defaults to VOICE_DNA_MODEL). */
  model?: string;
  /** Override max_tokens (defaults to VOICE_DNA_MAX_TOKENS). */
  maxTokens?: number;
}

/**
 * Production ILLMClient backed by the Anthropic SDK.
 *
 * The system prompt is marked `cache_control: ephemeral` so the manifesto
 * + instruction block (which is identical across every onboarding run) is
 * served from Anthropic's prompt cache. This buys ~3-5x cost reduction on
 * cached tokens and meaningful latency reduction.
 */
export class AnthropicLLMClient implements ILLMClient, IChatLLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicLLMClientOptions = {}) {
    if (opts.client) {
      this.client = opts.client;
    } else {
      const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Missing ANTHROPIC_API_KEY env var. Set it in .env.local (see .env.example).",
        );
      }
      this.client = new Anthropic({ apiKey });
    }
    this.model = opts.model ?? VOICE_DNA_MODEL;
    this.maxTokens = opts.maxTokens ?? VOICE_DNA_MAX_TOKENS;
  }

  async complete(args: { system: string; user: string }): Promise<string> {
    return timed(
      log,
      "anthropic.messages.create",
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: [
            {
              type: "text",
              text: args.system,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: args.user }],
        });

        log.debug("anthropic usage", {
          model: this.model,
          input_tokens: response.usage.input_tokens,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          output_tokens: response.usage.output_tokens,
          stop_reason: response.stop_reason,
        });

        const first = response.content[0];
        if (!first || first.type !== "text") {
          throw new Error(
            `AnthropicLLMClient: expected text block, got ${first?.type ?? "nothing"}`,
          );
        }
        return first.text;
      },
      {
        model: this.model,
        system_chars: args.system.length,
        user_chars: args.user.length,
      },
    );
  }

  /**
   * Multi-turn chat completion. Used by the Chat Engine.
   *
   * Same prompt-cache treatment on the system block. The history array is
   * passed to the SDK as-is; system messages in `args.messages` are filtered
   * out because Anthropic only accepts user/assistant turns in the messages
   * array. The Chat Engine never persists or sends a system role anyway.
   */
  async chat(args: { system: string; messages: ChatMessage[] }): Promise<string> {
    const turns = args.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    return timed(
      log,
      "anthropic.messages.create.chat",
      async () => {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: [
            {
              type: "text",
              text: args.system,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: turns,
        });

        log.debug("anthropic chat usage", {
          model: this.model,
          input_tokens: response.usage.input_tokens,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          output_tokens: response.usage.output_tokens,
          stop_reason: response.stop_reason,
          turn_count: turns.length,
        });

        const first = response.content[0];
        if (!first || first.type !== "text") {
          throw new Error(
            `AnthropicLLMClient.chat: expected text block, got ${first?.type ?? "nothing"}`,
          );
        }
        return first.text;
      },
      {
        model: this.model,
        system_chars: args.system.length,
        turn_count: turns.length,
      },
    );
  }
}
