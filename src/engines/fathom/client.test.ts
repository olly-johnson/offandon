import { describe, expect, it, vi } from "vitest";

import { FathomApiClient } from "./client";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function makeFetch(body: unknown, status = 200): FetchMock {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("FathomApiClient", () => {
  it("GETs the recording url with bearer auth and normalises the payload", async () => {
    const fetchImpl = makeFetch({
      id: "rec_42",
      title: "Strategy",
      started_at: "2026-05-17T10:00:00Z",
      duration_seconds: 1800,
      invitees: [
        { email: "OLLY@example.com", name: "Olly" },
        { email: "alice@client.com", name: "Alice" },
      ],
      transcript_plaintext: "speaker text",
      share_url: "https://fathom.video/calls/rec_42",
    });

    const client = new FathomApiClient({
      apiKey: "k",
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const out = await client.getRecording("rec_42");
    expect(out.recordingId).toBe("rec_42");
    expect(out.title).toBe("Strategy");
    expect(out.startedAt).toBe("2026-05-17T10:00:00Z");
    expect(out.durationSeconds).toBe(1800);
    expect(out.invitees.map((i) => i.email)).toEqual([
      "olly@example.com",
      "alice@client.com",
    ]);
    expect(out.transcriptPlaintext).toBe("speaker text");
    expect(out.shareUrl).toBe("https://fathom.video/calls/rec_42");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe("https://api.example.com/recordings/rec_42");
    const init = call[1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("GET");
    expect(init.headers["Authorization"]).toBe("Bearer k");
  });

  it("unwraps a nested 'recording' envelope", async () => {
    const fetchImpl = makeFetch({
      recording: {
        recording_id: "rec_inner",
        started_at: "2026-05-17T10:00:00Z",
        invitees: [{ email: "a@x.com" }],
        transcript: "body",
      },
    });
    const client = new FathomApiClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const out = await client.getRecording("rec_inner");
    expect(out.recordingId).toBe("rec_inner");
    expect(out.transcriptPlaintext).toBe("body");
  });

  it("throws when the API returns no transcript", async () => {
    const fetchImpl = makeFetch({
      id: "rec_x",
      started_at: "2026-05-17T10:00:00Z",
      invitees: [{ email: "a@x.com" }],
    });
    const client = new FathomApiClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getRecording("rec_x")).rejects.toThrow(/transcript/);
  });

  it("throws with status code on non-2xx", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("nope", { status: 404 }),
    );
    const client = new FathomApiClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getRecording("rec_404")).rejects.toThrow(/404/);
  });
});
