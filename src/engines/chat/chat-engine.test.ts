import { describe, expect, it } from "vitest";

import { SlopError } from "@/lib/shared/anti-slop";

import {
  ChatEngine,
  type ChatLLMMessage,
  type ChatLLMResponse,
  type ChatLLMTool,
  type IChatLLMClient,
} from "./chat-engine";
import { buildChatSystemPrompt, HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { ChatMessage, ChatToolDefinition } from "./types";
import type { VoiceDNA } from "@/engines/voice/types";

const DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic", "direct", "candid"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition.",
      example_topics: ["Lead-gen audit", "Content sprints"],
    },
    {
      name: "Receipts and Postmortems",
      description: "Specific case studies with numbers.",
      example_topics: ["A 5K MRR client", "A failed launch"],
    },
  ],
  prohibited_phrases: ["delve", "tapestry", "embark"],
  audience_persona: {
    description: "Coaches with proof of work who want serious clients.",
    pain_points: ["Inconsistent lead flow"],
    aspirations: ["Predictable monthly revenue"],
    language_register: "operator-to-operator, no jargon",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

/** Wrap a plain text reply in the new ChatLLMResponse shape. */
function textOnly(text: string): ChatLLMResponse {
  return { text, tool_uses: [], stop_reason: "end_turn" };
}

class MockChatLLM implements IChatLLMClient {
  public readonly calls: Array<{
    system: string;
    messages: ChatLLMMessage[];
    tools?: ChatLLMTool[];
  }> = [];
  /** A queue of responses; LLM returns them in order. */
  private readonly queue: ChatLLMResponse[];

  constructor(responses: ChatLLMResponse | ChatLLMResponse[]) {
    this.queue = Array.isArray(responses) ? [...responses] : [responses];
  }

  async chat(args: {
    system: string;
    messages: ChatLLMMessage[];
    tools?: ChatLLMTool[];
  }): Promise<ChatLLMResponse> {
    this.calls.push(args);
    const next = this.queue.shift();
    if (!next) throw new Error("MockChatLLM queue exhausted");
    return next;
  }
}

const FROZEN_NOW = () => new Date("2026-05-10T12:00:00.000Z");

describe("Chat system prompt", () => {
  it("loads the Humanization Manifesto verbatim from AGENTS.md", () => {
    expect(HUMANIZATION_MANIFESTO).toContain("Humanization Manifesto");
    expect(HUMANIZATION_MANIFESTO).toContain("em-dashes");
  });

  it("embeds the manifesto and the Voice DNA tone, pillars, and persona", () => {
    const prompt = buildChatSystemPrompt(DNA);
    expect(prompt).toContain(HUMANIZATION_MANIFESTO);
    expect(prompt).toContain("BEGIN HUMANIZATION MANIFESTO");
    expect(prompt).toContain("END HUMANIZATION MANIFESTO");
    expect(prompt).toContain("Operator Frameworks");
    expect(prompt).toContain("Coaches with proof of work");
    expect(prompt).toContain("professional-direct");
  });

  it("instructs the model to return plain prose, not JSON", () => {
    const prompt = buildChatSystemPrompt(DNA);
    expect(prompt).toMatch(/plain (prose|text)/i);
    expect(prompt).not.toMatch(/return only the json/i);
  });

  it("embeds the house methodology so chat can answer Trust Funnel and SCCCC questions", () => {
    const prompt = buildChatSystemPrompt(DNA);
    expect(prompt).toContain("Trust Funnel");
    expect(prompt).toContain("SCCCC");
    expect(prompt).toContain("Connection Points");
    expect(prompt).toContain("Message Lock");
  });

  it("embeds the chat slice so chat knows storytelling structure names", () => {
    const prompt = buildChatSystemPrompt(DNA);
    expect(prompt).toContain("Hero's Journey");
    expect(prompt).toContain("Man in a Hole");
    expect(prompt).toContain("peer-level operator");
  });
});

describe("ChatEngine.reply", () => {
  const HISTORY: ChatMessage[] = [
    { role: "user", content: "Give me a hook idea for the operator frameworks pillar." },
  ];

  it("calls the LLM with the manifesto-embedded system prompt and the supplied history", async () => {
    const llm = new MockChatLLM(
      textOnly("Try this hook. Most operators ship the system, not the polish."),
    );
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await engine.reply({ voiceDna: DNA, history: HISTORY });

    expect(llm.calls).toHaveLength(1);
    const { system, messages } = llm.calls[0];
    expect(system).toContain("Humanization Manifesto");
    expect(system).toContain("Operator Frameworks");
    expect(messages).toEqual([
      { role: "user", content: HISTORY[0].content },
    ]);
  });

  it("returns the assistant reply with metadata and an empty tool_actions list", async () => {
    const llm = new MockChatLLM(
      textOnly("Lead with a specific moment. Numbers, not adjectives."),
    );
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const reply = await engine.reply({ voiceDna: DNA, history: HISTORY });

    expect(reply.message.role).toBe("assistant");
    expect(reply.message.content).toContain("Lead with");
    expect(reply.meta.generated_at).toBe("2026-05-10T12:00:00.000Z");
    expect(reply.meta.history_length).toBe(1);
    expect(reply.tool_actions).toEqual([]);
  });

  it("rejects an empty history", async () => {
    const llm = new MockChatLLM(textOnly("nope"));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: [] })).rejects.toThrow(/history/i);
  });

  it("rejects a history that does not end with a user message", async () => {
    const llm = new MockChatLLM(textOnly("nope"));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const bad: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];

    await expect(engine.reply({ voiceDna: DNA, history: bad })).rejects.toThrow(/last message must be from the user/i);
  });

  it("rejects an empty assistant response from the LLM", async () => {
    const llm = new MockChatLLM(textOnly("   "));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toThrow(/empty/i);
  });

  it("strips markdown bold, headings, and --- separators before returning the reply", async () => {
    const llm = new MockChatLLM(
      textOnly(
        "## Quick take\n**Lead** with the moment.\n\n---\n\nThen __ship__ it.",
      ),
    );
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const reply = await engine.reply({ voiceDna: DNA, history: HISTORY });

    expect(reply.message.content).toBe(
      "Quick take\nLead with the moment.\n\nThen ship it.",
    );
  });

  it("instructs the model not to emit markdown formatting", () => {
    const prompt = buildChatSystemPrompt(DNA);
    expect(prompt).toMatch(/no markdown formatting/i);
    expect(prompt).toContain("**");
    expect(prompt).toContain("---");
  });

  it("throws SlopError when the assistant reply contains an em-dash", async () => {
    const llm = new MockChatLLM(textOnly("Strategic—and direct."));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the assistant reply contains a buzzword", async () => {
    const llm = new MockChatLLM(textOnly("Let us delve into the framework."));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the assistant reply contains an emoji", async () => {
    const llm = new MockChatLLM(textOnly("Strategic 🚀 take."));
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });
});

describe("ChatEngine.reply with tools", () => {
  const HISTORY: ChatMessage[] = [
    { role: "user", content: "Save 'the operator who never used a CRM' as an idea." },
  ];

  function makeSaveIdeaTool(handler: ChatToolDefinition["handler"]): ChatToolDefinition {
    return {
      name: "save_idea",
      description: "Save a short content idea to the user's Ideas Bank.",
      input_schema: {
        type: "object",
        properties: {
          content: { type: "string" },
          pillar: { type: "string" },
        },
        required: ["content"],
      },
      handler,
    };
  }

  it("passes tool definitions (without the handler) to the LLM", async () => {
    const llm = new MockChatLLM(textOnly("Got it."));
    const tool = makeSaveIdeaTool(async () => "ok");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await engine.reply({ voiceDna: DNA, history: HISTORY, tools: [tool] });

    const sent = llm.calls[0].tools;
    expect(sent).toHaveLength(1);
    expect(sent?.[0].name).toBe("save_idea");
    expect((sent?.[0] as unknown as Record<string, unknown>).handler).toBeUndefined();
  });

  it("executes the matching tool handler when the model emits a tool_use block, then returns the final text reply", async () => {
    const llm = new MockChatLLM([
      {
        text: "Saving that now.",
        tool_uses: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "save_idea",
            input: {
              content: "the operator who never used a CRM",
              pillar: "Operator Frameworks",
            },
          },
        ],
        stop_reason: "tool_use",
      },
      textOnly("Saved. Find it in the Ideas tab."),
    ]);

    const calls: Array<Record<string, unknown>> = [];
    const tool = makeSaveIdeaTool(async (input) => {
      calls.push(input);
      return "saved as idea-1";
    });

    const engine = new ChatEngine({ llm, now: FROZEN_NOW });
    const reply = await engine.reply({
      voiceDna: DNA,
      history: HISTORY,
      tools: [tool],
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].content).toBe("the operator who never used a CRM");
    expect(calls[0].pillar).toBe("Operator Frameworks");

    expect(reply.message.content).toBe("Saved. Find it in the Ideas tab.");
    expect(reply.tool_actions).toHaveLength(1);
    expect(reply.tool_actions[0]).toEqual({
      name: "save_idea",
      input: {
        content: "the operator who never used a CRM",
        pillar: "Operator Frameworks",
      },
      result: "saved as idea-1",
    });
  });

  it("sends the assistant tool_use turn and a user tool_result turn back to the LLM on the second iteration", async () => {
    const llm = new MockChatLLM([
      {
        text: "",
        tool_uses: [
          {
            type: "tool_use",
            id: "toolu_2",
            name: "save_idea",
            input: { content: "x" },
          },
        ],
        stop_reason: "tool_use",
      },
      textOnly("Saved."),
    ]);
    const tool = makeSaveIdeaTool(async () => "saved as idea-2");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await engine.reply({ voiceDna: DNA, history: HISTORY, tools: [tool] });

    expect(llm.calls).toHaveLength(2);
    const second = llm.calls[1].messages;
    // [user history] + [assistant tool_use block] + [user tool_result block]
    expect(second).toHaveLength(3);
    expect(second[1]).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_2",
          name: "save_idea",
          input: { content: "x" },
        },
      ],
    });
    expect(second[2]).toMatchObject({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_2",
          content: "saved as idea-2",
        },
      ],
    });
  });

  it("sends an error tool_result and continues when the model requests an unknown tool", async () => {
    const llm = new MockChatLLM([
      {
        text: "",
        tool_uses: [
          {
            type: "tool_use",
            id: "toolu_3",
            name: "nuke_database",
            input: {},
          },
        ],
        stop_reason: "tool_use",
      },
      textOnly("Sorry, I cannot do that."),
    ]);
    const tool = makeSaveIdeaTool(async () => "irrelevant");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const reply = await engine.reply({
      voiceDna: DNA,
      history: HISTORY,
      tools: [tool],
    });

    expect(reply.tool_actions).toEqual([]);
    const second = llm.calls[1].messages;
    const toolResult = second[2] as {
      role: "user";
      content: Array<{ type: string; content: string }>;
    };
    expect(toolResult.content[0].content).toMatch(/not available/i);
  });

  it("sends an error tool_result and continues when the handler throws", async () => {
    const llm = new MockChatLLM([
      {
        text: "",
        tool_uses: [
          {
            type: "tool_use",
            id: "toolu_4",
            name: "save_idea",
            input: { content: "x" },
          },
        ],
        stop_reason: "tool_use",
      },
      textOnly("Something went wrong on save, try again."),
    ]);
    const tool = makeSaveIdeaTool(async () => {
      throw new Error("db down");
    });
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const reply = await engine.reply({
      voiceDna: DNA,
      history: HISTORY,
      tools: [tool],
    });

    expect(reply.tool_actions).toEqual([]);
    const second = llm.calls[1].messages;
    const toolResult = second[2] as {
      role: "user";
      content: Array<{ type: string; content: string }>;
    };
    expect(toolResult.content[0].content).toMatch(/db down/);
  });

  it("throws after the configured tool iteration cap to prevent runaways", async () => {
    const toolUseResponse: ChatLLMResponse = {
      text: "",
      tool_uses: [
        {
          type: "tool_use",
          id: "toolu_loop",
          name: "save_idea",
          input: { content: "x" },
        },
      ],
      stop_reason: "tool_use",
    };
    const llm = new MockChatLLM([
      toolUseResponse,
      toolUseResponse,
      toolUseResponse,
    ]);
    const tool = makeSaveIdeaTool(async () => "ok");
    const engine = new ChatEngine({
      llm,
      now: FROZEN_NOW,
      maxToolIterations: 2,
    });

    await expect(
      engine.reply({ voiceDna: DNA, history: HISTORY, tools: [tool] }),
    ).rejects.toThrow(/iteration cap/);
  });
});
