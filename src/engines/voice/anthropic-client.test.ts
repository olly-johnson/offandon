import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnthropicLLMClient, VOICE_DNA_MODEL } from "./anthropic-client";

interface FakeCallArgs {
  model: string;
  max_tokens: number;
  system: Array<{ type: string; text: string; cache_control?: { type: string } }>;
  messages: Array<{ role: string; content: string }>;
}

class FakeAnthropic {
  public readonly calls: FakeCallArgs[] = [];
  public response: unknown = {
    content: [{ type: "text", text: "{}" }],
    usage: {
      input_tokens: 100,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 0,
      output_tokens: 30,
    },
    stop_reason: "end_turn",
  };

  messages = {
    create: async (args: FakeCallArgs) => {
      this.calls.push(args);
      return this.response;
    },
  };
}

function makeClient(fake: FakeAnthropic, opts: { model?: string; maxTokens?: number } = {}) {
  return new AnthropicLLMClient({
    client: fake as unknown as Anthropic,
    ...opts,
  });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AnthropicLLMClient", () => {
  it("sends the system prompt with cache_control: ephemeral", async () => {
    const fake = new FakeAnthropic();
    const client = makeClient(fake);

    await client.complete({ system: "manifesto", user: "answers" });

    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0];
    expect(call.system).toEqual([
      {
        type: "text",
        text: "manifesto",
        cache_control: { type: "ephemeral" },
      },
    ]);
  });

  it("uses the pinned model id from AGENTS.md", async () => {
    const fake = new FakeAnthropic();
    const client = makeClient(fake);

    await client.complete({ system: "s", user: "u" });

    expect(fake.calls[0].model).toBe(VOICE_DNA_MODEL);
    expect(VOICE_DNA_MODEL).toBe("claude-sonnet-4-6");
  });

  it("returns the first text block from the response", async () => {
    const fake = new FakeAnthropic();
    fake.response = {
      content: [{ type: "text", text: "the dna json" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    };
    const client = makeClient(fake);

    const out = await client.complete({ system: "s", user: "u" });

    expect(out).toBe("the dna json");
  });

  it("throws if the first block is not text (e.g. tool_use)", async () => {
    const fake = new FakeAnthropic();
    fake.response = {
      content: [{ type: "tool_use" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const client = makeClient(fake);

    await expect(client.complete({ system: "s", user: "u" })).rejects.toThrow(/text block/);
  });

  it("throws when ANTHROPIC_API_KEY is missing and no client is injected", () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => new AnthropicLLMClient()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });

  it("respects custom model and maxTokens overrides", async () => {
    const fake = new FakeAnthropic();
    const client = makeClient(fake, { model: "claude-haiku-4-5-20251001", maxTokens: 512 });

    await client.complete({ system: "s", user: "u" });

    expect(fake.calls[0].model).toBe("claude-haiku-4-5-20251001");
    expect(fake.calls[0].max_tokens).toBe(512);
  });

  it("invokes the onUsage callback after a successful complete() call", async () => {
    const fake = new FakeAnthropic();
    const onUsage = vi.fn();
    const client = new AnthropicLLMClient({
      client: fake as unknown as Anthropic,
      onUsage,
    });

    await client.complete({ system: "s", user: "u" });

    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith({
      model: VOICE_DNA_MODEL,
      input_tokens: 100,
      output_tokens: 30,
      cache_creation_tokens: 50,
      cache_read_tokens: 0,
      stop_reason: "end_turn",
    });
  });

  it("swallows errors thrown from onUsage so the call still succeeds", async () => {
    const fake = new FakeAnthropic();
    const onUsage = vi.fn().mockRejectedValue(new Error("recorder down"));
    const client = new AnthropicLLMClient({
      client: fake as unknown as Anthropic,
      onUsage,
    });

    const out = await client.complete({ system: "s", user: "u" });
    expect(out).toBe("{}");
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});
