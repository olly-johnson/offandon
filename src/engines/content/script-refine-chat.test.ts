import { describe, expect, it } from "vitest";

import { SlopError } from "@/lib/shared/anti-slop";
import {
  type ChatLLMMessage,
  type ChatLLMResponse,
  type ChatLLMTool,
  type IChatLLMClient,
} from "@/engines/chat/chat-engine";
import type { VoiceDNA } from "@/engines/voice/types";

import { ScriptRefineChat } from "./script-refine-chat";
import { buildScriptRefineSystemPrompt } from "./script-refine-system-prompt";
import type { CurrentScript, ScriptRefineChatTurn } from "./script-refine-chat";

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
  ],
  prohibited_phrases: ["delve", "tapestry"],
  audience_persona: {
    description: "Coaches with proof of work who want serious clients.",
    pain_points: ["Inconsistent lead flow"],
    aspirations: ["Predictable monthly revenue"],
    language_register: "operator-to-operator, no jargon",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

const CURRENT: CurrentScript = {
  hook: "Most coaches lose leads at the same point. It is not their offer.",
  body: "It is the discovery call. They lead with credentials when the prospect needs to feel understood. Reverse the order: first 90 seconds is their problem in their words. Watch booking rates climb.",
};

function textOnly(text: string): ChatLLMResponse {
  return { text, tool_uses: [], stop_reason: "end_turn" };
}

function withProposal(
  text: string,
  input: Record<string, unknown>,
): ChatLLMResponse {
  return {
    text,
    tool_uses: [
      { type: "tool_use", id: "tool-1", name: "propose_script_edit", input },
    ],
    stop_reason: "tool_use",
  };
}

class MockChatLLM implements IChatLLMClient {
  public readonly calls: Array<{
    system: string;
    messages: ChatLLMMessage[];
    tools?: ChatLLMTool[];
  }> = [];
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

const FROZEN_NOW = () => new Date("2026-05-29T12:00:00.000Z");

const HISTORY: ScriptRefineChatTurn[] = [
  { role: "user", content: "Make the close land harder." },
];

describe("script refine system prompt", () => {
  it("embeds the current script so the assistant edits what the creator sees", () => {
    const prompt = buildScriptRefineSystemPrompt(DNA, CURRENT);
    expect(prompt).toContain(CURRENT.hook);
    expect(prompt).toContain(CURRENT.body);
  });

  it("describes the propose_script_edit tool and the accept/reject contract", () => {
    const prompt = buildScriptRefineSystemPrompt(DNA, CURRENT);
    expect(prompt).toContain("propose_script_edit");
    expect(prompt).toMatch(/accept|reject/i);
  });

  it("carries the creator's voice so edits stay on-brand", () => {
    const prompt = buildScriptRefineSystemPrompt(DNA, CURRENT);
    expect(prompt).toContain("professional-direct");
    expect(prompt).toContain("Operator Frameworks");
  });

  it("keeps the anti-slop guardrails in scope", () => {
    const prompt = buildScriptRefineSystemPrompt(DNA, CURRENT);
    expect(prompt).toMatch(/em-dash/i);
  });
});

describe("ScriptRefineChat.reply", () => {
  it("returns a plain assistant message when the model only discusses", async () => {
    const llm = new MockChatLLM(
      textOnly("The close already names a concrete next step, so it lands."),
    );
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });

    const res = await engine.reply({
      voiceDna: DNA,
      concept: "Why coaches lose leads on the discovery call.",
      currentScript: CURRENT,
      history: HISTORY,
    });

    expect(res.message.role).toBe("assistant");
    expect(res.message.content).toContain("close");
    expect(res.proposal).toBeUndefined();
    expect(res.meta.generated_at).toBe("2026-05-29T12:00:00.000Z");
  });

  it("captures an amended script when the model calls propose_script_edit", async () => {
    const newBody =
      "It is the discovery call. Most coaches open with their resume. Flip it. Spend the first 90 seconds on the prospect's problem in their own words. Booking rates climb, and they have not even heard your offer yet.";
    const llm = new MockChatLLM(
      withProposal("I tightened the close and led with their problem.", {
        hook: CURRENT.hook,
        body: newBody,
        summary: "Leads with the prospect's problem and sharpens the close.",
      }),
    );
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });

    const res = await engine.reply({
      voiceDna: DNA,
      concept: "Why coaches lose leads on the discovery call.",
      currentScript: CURRENT,
      history: HISTORY,
    });

    expect(res.proposal).toBeDefined();
    expect(res.proposal?.hook).toBe(CURRENT.hook);
    expect(res.proposal?.body).toBe(newBody);
    expect(res.proposal?.summary).toContain("problem");
    // word_count is computed from the body, not trusted from the model.
    expect(res.proposal?.word_count).toBe(
      newBody.trim().split(/\s+/).filter(Boolean).length,
    );
    expect(res.message.content).toContain("tightened");
  });

  it("falls back to the summary as the chat message when the model emits no prose", async () => {
    const llm = new MockChatLLM(
      withProposal("", {
        hook: CURRENT.hook,
        body: "It is the discovery call. Lead with their problem first. Then earn the offer.",
        summary: "Shorter, problem-first version.",
      }),
    );
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });

    const res = await engine.reply({
      voiceDna: DNA,
      concept: "Why coaches lose leads on the discovery call.",
      currentScript: CURRENT,
      history: HISTORY,
    });

    expect(res.message.content).toBe("Shorter, problem-first version.");
    expect(res.proposal).toBeDefined();
  });

  it("offers exactly the propose_script_edit tool to the model", async () => {
    const llm = new MockChatLLM(textOnly("Looks solid as is."));
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });
    await engine.reply({
      voiceDna: DNA,
      concept: "Why coaches lose leads on the discovery call.",
      currentScript: CURRENT,
      history: HISTORY,
    });
    const tools = llm.calls[0]?.tools ?? [];
    expect(tools.map((t) => t.name)).toEqual(["propose_script_edit"]);
  });

  it("rejects a proposed edit that fails the anti-slop validator", async () => {
    const llm = new MockChatLLM(
      withProposal("Here is a slicker take.", {
        hook: "Let me delve into why coaches lose leads.",
        body: "We will delve deeper into the discovery call problem.",
        summary: "Punchier hook.",
      }),
    );
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });

    await expect(
      engine.reply({
        voiceDna: DNA,
        concept: "Why coaches lose leads on the discovery call.",
        currentScript: CURRENT,
        history: HISTORY,
      }),
    ).rejects.toBeInstanceOf(SlopError);
  });

  it("throws when a proposal is missing the body", async () => {
    const llm = new MockChatLLM(
      withProposal("Done.", {
        hook: CURRENT.hook,
        summary: "Tweaked the hook.",
      }),
    );
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });
    await expect(
      engine.reply({
        voiceDna: DNA,
        concept: "Why coaches lose leads on the discovery call.",
        currentScript: CURRENT,
        history: HISTORY,
      }),
    ).rejects.toThrow(/body/i);
  });

  it("throws when history is empty", async () => {
    const llm = new MockChatLLM(textOnly("noop"));
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });
    await expect(
      engine.reply({
        voiceDna: DNA,
        concept: "Why coaches lose leads on the discovery call.",
        currentScript: CURRENT,
        history: [],
      }),
    ).rejects.toThrow(/history/i);
  });

  it("throws when the last turn is not from the user", async () => {
    const llm = new MockChatLLM(textOnly("noop"));
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });
    await expect(
      engine.reply({
        voiceDna: DNA,
        concept: "Why coaches lose leads on the discovery call.",
        currentScript: CURRENT,
        history: [{ role: "assistant", content: "hi" }],
      }),
    ).rejects.toThrow(/user/i);
  });

  it("forwards the full conversation to the model", async () => {
    const llm = new MockChatLLM(textOnly("Sure thing."));
    const engine = new ScriptRefineChat({ llm, now: FROZEN_NOW });
    const history: ScriptRefineChatTurn[] = [
      { role: "user", content: "Punch up the hook." },
      { role: "assistant", content: "Done." },
      { role: "user", content: "Now shorten the close." },
    ];
    await engine.reply({
      voiceDna: DNA,
      concept: "Why coaches lose leads on the discovery call.",
      currentScript: CURRENT,
      history,
    });
    expect(llm.calls[0]?.messages).toEqual([
      { role: "user", content: "Punch up the hook." },
      { role: "assistant", content: "Done." },
      { role: "user", content: "Now shorten the close." },
    ]);
  });
});
