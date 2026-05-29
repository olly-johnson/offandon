import { SlopError, validateAntiSlop, type SlopViolation } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import { stripChatMarkdown } from "@/lib/shared/markdown-strip";
import type {
  ChatLLMMessage,
  ChatLLMTool,
  IChatLLMClient,
} from "@/engines/chat/chat-engine";
import type { VoiceDNA } from "@/engines/voice/types";

import { buildScriptRefineSystemPrompt } from "./script-refine-system-prompt";
import type { ContentMethodologyContext, IMF } from "./types";

const log = createLogger("content.script-refine-chat");

/** Name of the single tool the model may call to hand back an amended script. */
export const PROPOSE_TOOL_NAME = "propose_script_edit";

const PROPOSE_TOOL: ChatLLMTool = {
  name: PROPOSE_TOOL_NAME,
  description:
    "Propose a revised version of the script for the creator to accept or reject. " +
    "Call this ONLY when the creator wants a change. Always include the COMPLETE " +
    "revised script (full hook and full body), not just the edited parts.",
  input_schema: {
    type: "object",
    properties: {
      hook: {
        type: "string",
        description: "The revised opening hook, verbatim, as the script's first line.",
      },
      body: {
        type: "string",
        description: "The complete revised script body (everything after the hook).",
      },
      summary: {
        type: "string",
        description: "One short sentence describing what changed and why.",
      },
    },
    required: ["hook", "body", "summary"],
  },
};

export interface CurrentScript {
  hook: string;
  body: string;
}

export interface ScriptRefineChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ScriptRefineProposal {
  hook: string;
  body: string;
  /** Computed from `body` by the engine, not trusted from the model. */
  word_count: number;
  summary: string;
}

export interface ScriptRefineReplyInput {
  voiceDna: VoiceDNA;
  concept: string;
  imf?: IMF;
  /** The exact script the creator is looking at (may include manual edits). */
  currentScript: CurrentScript;
  /** Full conversation so far. Non-empty; the last turn must be the user's. */
  history: ScriptRefineChatTurn[];
  userMethodology?: string | null;
  methodologyContext?: ContentMethodologyContext;
}

export interface ScriptRefineReply {
  message: { role: "assistant"; content: string };
  /** Present only when the model called `propose_script_edit`. */
  proposal?: ScriptRefineProposal;
  meta: {
    generated_at: string;
    history_length: number;
  };
}

export interface ScriptRefineChatOptions {
  llm: IChatLLMClient;
  now?: () => Date;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Conversational refine surface. One tool-enabled round trip per creator
 * turn: the model either discusses the script (plain prose) or calls
 * `propose_script_edit` to hand back a full amended version. Unlike the
 * ChatEngine we do NOT loop tool results back to the model: a proposal is
 * terminal for the turn because the creator, not the model, decides whether
 * to accept it.
 */
export class ScriptRefineChat {
  private readonly llm: IChatLLMClient;
  private readonly now: () => Date;

  constructor(opts: ScriptRefineChatOptions) {
    this.llm = opts.llm;
    this.now = opts.now ?? (() => new Date());
  }

  async reply(input: ScriptRefineReplyInput): Promise<ScriptRefineReply> {
    if (!Array.isArray(input.history) || input.history.length === 0) {
      throw new Error("ScriptRefineChat: history must be a non-empty array");
    }
    const last = input.history[input.history.length - 1];
    if (last.role !== "user") {
      throw new Error("ScriptRefineChat: last message must be from the user");
    }

    const ctx = input.methodologyContext;
    const system = buildScriptRefineSystemPrompt(
      input.voiceDna,
      input.currentScript,
      input.imf,
      input.userMethodology,
      ctx && ctx.house !== undefined && ctx.scripts !== undefined
        ? { house: ctx.house, scripts: ctx.scripts }
        : undefined,
      ctx?.operatorRules ?? [],
    );

    const messages: ChatLLMMessage[] = input.history.map(
      (m): ChatLLMMessage =>
        m.role === "user"
          ? { role: "user", content: m.content }
          : { role: "assistant", content: m.content },
    );

    const response = await this.llm.chat({
      system,
      messages,
      tools: [PROPOSE_TOOL],
    });

    const meta = {
      generated_at: this.now().toISOString(),
      history_length: input.history.length,
    };

    const proposeUse = response.tool_uses.find((t) => t.name === PROPOSE_TOOL_NAME);

    if (proposeUse) {
      const proposal = this.buildProposal(proposeUse.input);
      // The model's prose explains the change; when it returned no prose,
      // fall back to the proposal summary so the chat never shows a blank
      // bubble next to a diff.
      const prose = stripChatMarkdown(response.text).trim();
      const content = prose.length > 0 ? prose : proposal.summary;
      this.assertClean(content);
      return { message: { role: "assistant", content }, proposal, meta };
    }

    const content = stripChatMarkdown(response.text).trim();
    if (content.length === 0) {
      throw new Error("ScriptRefineChat: LLM returned an empty assistant message");
    }
    this.assertClean(content);
    return { message: { role: "assistant", content }, meta };
  }

  private buildProposal(input: Record<string, unknown>): ScriptRefineProposal {
    const hook = input.hook;
    const body = input.body;
    const summary = input.summary;
    if (typeof hook !== "string" || hook.trim().length === 0) {
      throw new Error("ScriptRefineChat: proposed hook missing or empty");
    }
    if (typeof body !== "string" || body.trim().length === 0) {
      throw new Error("ScriptRefineChat: proposed body missing or empty");
    }
    if (typeof summary !== "string" || summary.trim().length === 0) {
      throw new Error("ScriptRefineChat: proposed summary missing or empty");
    }

    // Validate the user-facing script text against anti-slop before it can
    // reach the diff. The summary is validated as part of the chat message.
    const violations: SlopViolation[] = [];
    for (const text of [hook, body]) {
      const r = validateAntiSlop(text);
      if (!r.ok) violations.push(...r.violations);
    }
    if (violations.length > 0) {
      log.warn("proposed edit failed anti-slop", {
        violation_count: violations.length,
        first_type: violations[0]?.type,
      });
      throw new SlopError(violations);
    }

    return {
      hook,
      body,
      word_count: countWords(body),
      summary: summary.trim(),
    };
  }

  private assertClean(content: string): void {
    const validation = validateAntiSlop(content);
    if (!validation.ok) {
      log.warn("assistant reply failed anti-slop", {
        violation_count: validation.violations.length,
        first_type: validation.violations[0]?.type,
      });
      throw new SlopError(validation.violations);
    }
  }
}
