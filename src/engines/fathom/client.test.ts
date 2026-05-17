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

const sampleItem = {
  recording_id: 42,
  title: "Coaching",
  recording_start_time: "2026-05-17T10:00:00Z",
  calendar_invitees: [
    { name: "Olly", email: "olly@example.com", is_external: false },
    { name: "Alice", email: "alice@client.com", is_external: true },
  ],
  recorded_by: { email: "olly@example.com" },
  transcript: [
    {
      speaker: { display_name: "Olly" },
      text: "hi",
      timestamp: "00:00",
    },
  ],
  share_url: "https://fathom.video/share/abc",
};

describe("FathomApiClient.listMeetings", () => {
  it("GETs /meetings with X-Api-Key auth and parses items", async () => {
    const fetchImpl = makeFetch({
      items: [sampleItem],
      next_cursor: "next-cursor-token",
      limit: 1,
    });
    const client = new FathomApiClient({
      apiKey: "k",
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const page = await client.listMeetings({ limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].recordingId).toBe("42");
    expect(page.items[0].invitees[1].isExternal).toBe(true);
    expect(page.items[0].transcriptPlaintext).toBe("Olly: hi");
    expect(page.nextCursor).toBe("next-cursor-token");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe("https://api.example.com/meetings?limit=1");
    const init = call[1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("GET");
    expect(init.headers["X-Api-Key"]).toBe("k");
  });

  it("passes the cursor through on subsequent pages", async () => {
    const fetchImpl = makeFetch({ items: [], next_cursor: null });
    const client = new FathomApiClient({
      apiKey: "k",
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listMeetings({ limit: 5, cursor: "abc==" });
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe("https://api.example.com/meetings?limit=5&cursor=abc%3D%3D");
  });

  it("skips malformed items but returns the well-formed ones", async () => {
    const fetchImpl = makeFetch({
      items: [
        sampleItem,
        { recording_id: 7 }, // missing started_at + invitees + transcript
      ],
      next_cursor: null,
    });
    const client = new FathomApiClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const page = await client.listMeetings();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].recordingId).toBe("42");
    expect(page.nextCursor).toBeNull();
  });

  it("throws with status on non-2xx", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response("nope", { status: 401 }),
    );
    const client = new FathomApiClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.listMeetings()).rejects.toThrow(/401/);
  });
});
