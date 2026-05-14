import Anthropic from "@anthropic-ai/sdk";

import type {
  ChatLLMMessage,
  ChatLLMResponse,
  ChatLLMTool,
  ChatLLMToolUseBlock,
  IChatLLMClient,
} from "@/engines/chat/chat-engine";
import { createLogger, timed } from "@/lib/shared/logger";

import type { ILLMClient } from "./voice";

const log = createLogger("voice.anthropic");

/**
 * Pinned in AGENTS.md / CLAUDE.md as the primary LLM. If you upgrade,
 * update both docs and the test fixtures.
 */
export const VOICE_DNA_MODEL = "claude-sonnet-4-6";

/**
 * Lightweight model used by background passes like the post-chat memory
 * extractor. Haiku 4.5 is fast and cheap; quality is sufficient for
 * structured-JSON extraction tasks where the output schema is tight.
 */
export const MEMORY_EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";

/**
 * Generous cap. Voice DNA JSON sits well under 1k tokens; the headroom is
 * for slow-typing models and any future schema growth.
 */
export const VOICE_DNA_MAX_TOKENS = 2048;

/**
 * Token usage emitted by the client after every successful round trip.
 * Caller decides what to do with it (record to api_usage, log, ignore).
 */
export interface UsageRecord {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  stop_reason: string | null;
}

export interface AnthropicLLMClientOptions {
  /** Override the SDK client (used by tests). */
  client?: Anthropic;
  /** Override API key (defaults to ANTHROPIC_API_KEY env). */
  apiKey?: string;
  /** Override model id (defaults to VOICE_DNA_MODEL). */
  model?: string;
  /** Override max_tokens (defaults to VOICE_DNA_MAX_TOKENS). */
  maxTokens?: number;
  /**
   * Optional usage sink. Fired once per successful response with the
   * raw token counts the SDK returned. Errors are swallowed so a
   * misbehaving recorder cannot break the user-visible flow.
   */
  onUsage?: (entry: UsageRecord) => void | Promise<void>;
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
  private readonly onUsage?: (entry: UsageRecord) => void | Promise<void>;

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
    this.onUsage = opts.onUsage;
  }

  /**
   * Fire-and-forget usage callback. Swallowed errors so the user-visible
   * flow never fails because of telemetry. Awaited deliberately so test
   * mocks can synchronise; in production the recorder is non-blocking.
   */
  private async reportUsage(entry: UsageRecord): Promise<void> {
    if (!this.onUsage) return;
    try {
      await this.onUsage(entry);
    } catch (err) {
      log.warn("onUsage callback threw", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
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

        await this.reportUsage({
          model: this.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          stop_reason: response.stop_reason ?? null,
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
   * Same prompt-cache treatment on the system block. Messages flow through
   * as the SDK expects: plain string content for normal turns, content-block
   * arrays for tool-use and tool-result turns. The engine is responsible for
   * building the right structure; this client just translates and ferries.
   */
  async chat(args: {
    system: string;
    messages: ChatLLMMessage[];
    tools?: ChatLLMTool[];
  }): Promise<ChatLLMResponse> {
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
          // The SDK's MessageParam type is a union we already model exactly
          // in ChatLLMMessage. Cast is safe and avoids a redundant mapping
          // pass over every block.
          messages: args.messages as Parameters<
            typeof this.client.messages.create
          >[0]["messages"],
          ...(args.tools && args.tools.length > 0
            ? {
                tools: args.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  input_schema: t.input_schema,
                })),
              }
            : {}),
        });

        log.debug("anthropic chat usage", {
          model: this.model,
          input_tokens: response.usage.input_tokens,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          output_tokens: response.usage.output_tokens,
          stop_reason: response.stop_reason,
          turn_count: args.messages.length,
          tools_offered: args.tools?.length ?? 0,
        });

        await this.reportUsage({
          model: this.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
          stop_reason: response.stop_reason ?? null,
        });

        let text = "";
        const tool_uses: ChatLLMToolUseBlock[] = [];
        for (const block of response.content) {
          if (block.type === "text") {
            text += block.text;
          } else if (block.type === "tool_use") {
            tool_uses.push({
              type: "tool_use",
              id: block.id,
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>,
            });
          }
        }
        return {
          text,
          tool_uses,
          stop_reason: response.stop_reason ?? "end_turn",
        };
      },
      {
        model: this.model,
        system_chars: args.system.length,
        turn_count: args.messages.length,
      },
    );
  }
}
