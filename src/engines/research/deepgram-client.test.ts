import { describe, expect, it, vi } from "vitest";

import { DeepgramTranscriptionClient } from "./deepgram-client";

function makeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe("DeepgramTranscriptionClient", () => {
  it("posts audio to /v1/listen with the configured model and returns the transcript", async () => {
    const fetchImpl = makeFetch({
      metadata: { duration: 42.5 },
      results: {
        channels: [{ alternatives: [{ transcript: "Hello world." }] }],
      },
    });
    const client = new DeepgramTranscriptionClient({
      apiKey: "k",
      fetchImpl,
    });

    const out = await client.transcribe(new Uint8Array([1, 2, 3, 4]));

    expect(out.text).toBe("Hello world.");
    expect(out.duration_seconds).toBe(42.5);

    const call = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0];
    const url = call[0] as URL;
    expect(url.toString()).toContain("model=nova-3");
    expect(url.toString()).toContain("detect_language=true");
    const opts = call[1] as RequestInit & { headers: Record<string, string> };
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Token k");
    expect(opts.headers["Content-Type"]).toBe("audio/mp4");
  });

  it("throws when Deepgram responds non-2xx", async () => {
    const fetchImpl = makeFetch({ err: "bad audio" }, 400);
    const client = new DeepgramTranscriptionClient({
      apiKey: "k",
      fetchImpl,
    });

    await expect(client.transcribe(new Uint8Array([1]))).rejects.toThrow(
      /Deepgram 400/,
    );
  });

  it("returns an empty transcript for a no-speech reel (music only)", async () => {
    // Deepgram answers 200 with a blank transcript when the audio has
    // no speech (a music-only or visual reel). That is a valid result,
    // not an error: the caller analyses from caption + metrics.
    const fetchImpl = makeFetch({
      metadata: { duration: 12 },
      results: { channels: [{ alternatives: [{ transcript: "   " }] }] },
    });
    const client = new DeepgramTranscriptionClient({
      apiKey: "k",
      fetchImpl,
    });

    const out = await client.transcribe(new Uint8Array([1]));
    expect(out.text).toBe("");
    expect(out.duration_seconds).toBe(12);
  });

  it("throws when the response is malformed (no transcript field at all)", async () => {
    // A response missing results/channels/alternatives means we could
    // not parse Deepgram's output, which is a genuine failure, distinct
    // from a no-speech reel.
    const fetchImpl = makeFetch({ metadata: { duration: 9 } });
    const client = new DeepgramTranscriptionClient({
      apiKey: "k",
      fetchImpl,
    });

    await expect(client.transcribe(new Uint8Array([1]))).rejects.toThrow(
      /malformed/,
    );
  });

  it("throws on construction without an API key", () => {
    const prior = process.env.DEEPGRAM_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
    try {
      expect(() => new DeepgramTranscriptionClient()).toThrow(/DEEPGRAM_API_KEY/);
    } finally {
      if (prior !== undefined) process.env.DEEPGRAM_API_KEY = prior;
    }
  });

  it("exposes a stable modelId for the DB row", () => {
    const client = new DeepgramTranscriptionClient({
      apiKey: "k",
      fetchImpl: makeFetch({}),
    });
    expect(client.modelId).toBe("deepgram-nova-3");
  });
});
