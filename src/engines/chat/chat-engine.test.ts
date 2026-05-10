import { describe, expect, it } from "vitest";

import { SlopError } from "@/lib/shared/anti-slop";

import { ChatEngine, type IChatLLMClient } from "./chat-engine";
import { buildChatSystemPrompt, HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { ChatMessage } from "./types";
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

class MockChatLLM implements IChatLLMClient {
  public readonly calls: Array<{ system: string; messages: ChatMessage[] }> = [];
  constructor(private readonly response: string) {}
  async chat(args: { system: string; messages: ChatMessage[] }): Promise<string> {
    this.calls.push(args);
    return this.response;
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
});

describe("ChatEngine.reply", () => {
  const HISTORY: ChatMessage[] = [
    { role: "user", content: "Give me a hook idea for the operator frameworks pillar." },
  ];

  it("calls the LLM with the manifesto-embedded system prompt and the supplied history", async () => {
    const llm = new MockChatLLM("Try this hook. Most operators ship the system, not the polish.");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await engine.reply({ voiceDna: DNA, history: HISTORY });

    expect(llm.calls).toHaveLength(1);
    const { system, messages } = llm.calls[0];
    expect(system).toContain("Humanization Manifesto");
    expect(system).toContain("Operator Frameworks");
    expect(messages).toEqual(HISTORY);
  });

  it("returns the assistant reply with metadata", async () => {
    const llm = new MockChatLLM("Lead with a specific moment. Numbers, not adjectives.");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const reply = await engine.reply({ voiceDna: DNA, history: HISTORY });

    expect(reply.message.role).toBe("assistant");
    expect(reply.message.content).toContain("Lead with");
    expect(reply.meta.generated_at).toBe("2026-05-10T12:00:00.000Z");
    expect(reply.meta.history_length).toBe(1);
  });

  it("rejects an empty history", async () => {
    const llm = new MockChatLLM("nope");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: [] })).rejects.toThrow(/history/i);
  });

  it("rejects a history that does not end with a user message", async () => {
    const llm = new MockChatLLM("nope");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    const bad: ChatMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];

    await expect(engine.reply({ voiceDna: DNA, history: bad })).rejects.toThrow(/last message must be from the user/i);
  });

  it("rejects an empty assistant response from the LLM", async () => {
    const llm = new MockChatLLM("   ");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toThrow(/empty/i);
  });

  it("throws SlopError when the assistant reply contains an em-dash", async () => {
    const llm = new MockChatLLM("Strategic—and direct.");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the assistant reply contains a buzzword", async () => {
    const llm = new MockChatLLM("Let us delve into the framework.");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });

  it("throws SlopError when the assistant reply contains an emoji", async () => {
    const llm = new MockChatLLM("Strategic 🚀 take.");
    const engine = new ChatEngine({ llm, now: FROZEN_NOW });

    await expect(engine.reply({ voiceDna: DNA, history: HISTORY })).rejects.toBeInstanceOf(SlopError);
  });
});
