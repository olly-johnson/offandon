/**
 * Master Bot engine. Thin wrapper around the same IChatLLMClient the
 * ChatEngine uses, but with its own system prompt and tool set. Skips
 * anti-slop (admin-internal) and Voice DNA (not a creator surface).
 */

import { createLogger } from "@/lib/shared/logger";

import type {
  ChatLLMAssistantBlock,
  ChatLLMMessage,
  ChatLLMTool,
  ChatLLMToolResultBlock,
  IChatLLMClient,
} from "@/engines/chat/chat-engine";
import type { ChatToolDefinition } from "@/engines/chat/types";

const log = createLogger("master-bot.engine");

const MAX_TOOL_ITERATIONS = 6;

export interface MasterBotReplyInput {
  systemPrompt: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  tools: ChatToolDefinition[];
}

export interface MasterBotToolAction {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

export interface MasterBotReply {
  text: string;
  tool_actions: MasterBotToolAction[];
}

export class MasterBotEngine {
  constructor(private readonly llm: IChatLLMClient) {}

  async reply(input: MasterBotReplyInput): Promise<MasterBotReply> {
    if (!Array.isArray(input.history) || input.history.length === 0) {
      throw new Error("MasterBotEngine: history must be non-empty");
    }
    if (input.history[input.history.length - 1].role !== "user") {
      throw new Error("MasterBotEngine: last message must be from the user");
    }

    const tools: ChatLLMTool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const messages: ChatLLMMessage[] = input.history.map(
      (m): ChatLLMMessage =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: m.content },
    );

    const tool_actions: MasterBotToolAction[] = [];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const response = await this.llm.chat({
        system: input.systemPrompt,
        messages,
        tools,
      });

      if (response.tool_uses.length === 0) {
        const text = response.text.trim();
        if (text.length === 0) {
          throw new Error("MasterBotEngine: LLM returned empty assistant message");
        }
        return { text, tool_actions };
      }

      // Echo the assistant turn back into history (Anthropic protocol).
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
        const tool = input.tools.find((t) => t.name === tu.name);
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
          tool_actions.push({ name: tu.name, input: tu.input, result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown failure";
          log.error("tool handler threw", { name: tu.name, message });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Error executing ${tu.name}: ${message}`,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(`MasterBotEngine: exceeded tool iteration cap of ${MAX_TOOL_ITERATIONS}`);
  }
}
