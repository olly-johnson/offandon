import { SlopError, validateAntiSlop } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";

import { buildChatSystemPrompt } from "./system-prompt";
import type {
  ChatReply,
  ChatReplyInput,
  ChatToolAction,
  IChatEngine,
} from "./types";

const log = createLogger("chat.engine");

/**
 * Six tool round-trips is well past the realistic ceiling for our current
 * toolset (we only ship save_idea). The cap exists so a misbehaving model
 * can't burn budget in an infinite tool loop.
 */
const MAX_TOOL_ITERATIONS = 6;

/* ---------------------------------------------------------------------------
 * LLM client surface
 *
 * Distinct from voice's `ILLMClient.complete({system, user})` because chat
 * needs the full message history AND optional tool definitions. The
 * AnthropicLLMClient implements both ILLMClient and this so production wiring
 * is one client, not two.
 * --------------------------------------------------------------------------- */

export interface ChatLLMTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ChatLLMTextBlock {
  type: "text";
  text: string;
}

export interface ChatLLMToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatLLMAssistantBlock = ChatLLMTextBlock | ChatLLMToolUseBlock;

export interface ChatLLMToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

/**
 * Messages exchanged with the LLM. Richer than the persisted ChatMessage
 * because tool-use turns carry structured content blocks; plain user/assistant
 * turns pass through as strings.
 */
export type ChatLLMMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; content: ChatLLMAssistantBlock[] }
  | { role: "user"; content: ChatLLMToolResultBlock[] };

export interface ChatLLMResponse {
  /** Concatenated text from all text blocks. Empty when the model only used tools. */
  text: string;
  tool_uses: ChatLLMToolUseBlock[];
  stop_reason: string;
}

export interface IChatLLMClient {
  chat(args: {
    system: string;
    messages: ChatLLMMessage[];
    tools?: ChatLLMTool[];
  }): Promise<ChatLLMResponse>;
}

/* ---------------------------------------------------------------------------
 * Engine
 * --------------------------------------------------------------------------- */

export interface ChatEngineOptions {
  llm: IChatLLMClient;
  /** Override the wall clock; useful for deterministic tests. */
  now?: () => Date;
  /** Override the iteration cap; useful for deterministic tests. */
  maxToolIterations?: number;
}

export class ChatEngine implements IChatEngine {
  private readonly llm: IChatLLMClient;
  private readonly now: () => Date;
  private readonly maxToolIterations: number;

  constructor(opts: ChatEngineOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
    this.maxToolIterations = opts.maxToolIterations ?? MAX_TOOL_ITERATIONS;
  }

  async reply(input: ChatReplyInput): Promise<ChatReply> {
    if (!Array.isArray(input.history) || input.history.length === 0) {
      throw new Error("ChatEngine: history must be a non-empty array");
    }
    const last = input.history[input.history.length - 1];
    if (last.role !== "user") {
      throw new Error("ChatEngine: last message must be from the user");
    }

    const system = buildChatSystemPrompt(
      input.voiceDna,
      input.memories,
      input.userMethodology,
    );

    const llmTools: ChatLLMTool[] | undefined = input.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const messages: ChatLLMMessage[] = input.history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m): ChatLLMMessage =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: m.content },
      );

    const toolActions: ChatToolAction[] = [];

    for (let iter = 0; iter < this.maxToolIterations; iter++) {
      const response = await this.llm.chat({
        system,
        messages,
        tools: llmTools,
      });

      if (response.tool_uses.length === 0) {
        const content = response.text.trim();
        if (content.length === 0) {
          throw new Error("ChatEngine: LLM returned an empty assistant message");
        }

        const validation = validateAntiSlop(content);
        if (!validation.ok) {
          log.warn("assistant reply failed anti-slop", {
            violation_count: validation.violations.length,
            first_type: validation.violations[0]?.type,
          });
          throw new SlopError(validation.violations);
        }

        return {
          message: { role: "assistant", content },
          meta: {
            generated_at: this.now().toISOString(),
            history_length: input.history.length,
          },
          tool_actions: toolActions,
        };
      }

      // Anthropic requires the assistant turn (text + tool_use blocks)
      // to be in the history before the tool_result blocks.
      const assistantBlocks: ChatLLMAssistantBlock[] = [];
      if (response.text.length > 0) {
        assistantBlocks.push({ type: "text", text: response.text });
      }
      for (const tu of response.tool_uses) {
        assistantBlocks.push({
          type: "tool_use",
          id: tu.id,
          name: tu.name,
          input: tu.input,
        });
      }
      messages.push({ role: "assistant", content: assistantBlocks });

      const toolResults: ChatLLMToolResultBlock[] = [];
      for (const tu of response.tool_uses) {
        const tool = input.tools?.find((t) => t.name === tu.name);
        if (!tool) {
          log.warn("LLM requested unknown tool", { name: tu.name });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error: tool "${tu.name}" is not available.`,
          });
          continue;
        }
        try {
          const result = await tool.handler(tu.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: result,
          });
          toolActions.push({ name: tu.name, input: tu.input, result });
        } catch (err) {
          log.error("tool handler threw", {
            name: tu.name,
            error: err instanceof Error ? err.message : String(err),
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error executing ${tu.name}: ${
              err instanceof Error ? err.message : "unknown failure"
            }`,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(
      `ChatEngine: exceeded tool iteration cap of ${this.maxToolIterations}`,
    );
  }
}
