import { describe, expect, it } from "vitest";

import {
  chunkText,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_CHUNK_TARGET_CHARS,
  EMBEDDING_DIMENSIONS,
  OpenAIEmbeddingsClient,
} from "./embeddings";

describe("chunkText", () => {
  it("returns empty array for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("returns one chunk for short input", () => {
    const text = "Short paragraph that fits in one chunk.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].startOffset).toBe(0);
  });

  it("splits a long paragraph-heavy text and indexes monotonically", () => {
    // ~12K chars, four roughly-equal paragraphs.
    const para = "Sentence. ".repeat(300);
    const text = [para, para, para, para].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => {
      expect(c.index).toBe(i);
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.text.length).toBeLessThanOrEqual(DEFAULT_CHUNK_TARGET_CHARS + 50);
    });
  });

  it("produces overlapping chunks (a tail of chunk N appears at the head of N+1)", () => {
    const long = "abcdefghij. ".repeat(800); // ~9600 chars
    const chunks = chunkText(long, { targetChars: 2000, overlapChars: 300 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 0; i < chunks.length - 1; i++) {
      const tail = chunks[i].text.slice(-80);
      // Tail won't be byte-identical because chunk boundaries snap to
      // sentence ends, but a substantive substring of the tail should
      // appear in the next chunk's first ~400 chars.
      const probe = tail.slice(-30).trim();
      if (probe.length >= 10) {
        expect(chunks[i + 1].text.slice(0, 600)).toContain(probe.slice(0, 10));
      }
    }
  });

  it("rejects overlap >= target", () => {
    expect(() => chunkText("xxxx", { targetChars: 100, overlapChars: 100 })).toThrow();
    expect(() => chunkText("xxxx", { targetChars: 100, overlapChars: 200 })).toThrow();
  });

  it("rejects non-positive target", () => {
    expect(() => chunkText("xxxx", { targetChars: 0 })).toThrow();
  });

  it("prefers paragraph breaks over hard cuts", () => {
    const head = "A".repeat(1500);
    const tail = "B".repeat(1500);
    const text = `${head}\n\n${tail}`;
    const chunks = chunkText(text, { targetChars: 2000, overlapChars: 200, minChars: 100 });
    // First chunk should end at the paragraph break, not mid-A.
    expect(chunks[0].text.endsWith("A")).toBe(true);
    expect(chunks[0].text).not.toContain("B");
  });
});

describe("OpenAIEmbeddingsClient", () => {
  it("throws if apiKey is missing", () => {
    expect(() => new OpenAIEmbeddingsClient({ apiKey: "" })).toThrow();
  });

  it("throws if input array is empty", async () => {
    const client = new OpenAIEmbeddingsClient({
      apiKey: "test",
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    await expect(client.embed([])).rejects.toThrow(/non-empty/);
  });

  it("throws if any input string is empty", async () => {
    const client = new OpenAIEmbeddingsClient({
      apiKey: "test",
      fetchImpl: async () => new Response("{}", { status: 200 }),
    });
    await expect(client.embed(["ok", ""])).rejects.toThrow(/non-empty string/);
  });

  it("posts to the embeddings endpoint with correct payload + headers", async () => {
    let captured: { url: string; body: unknown; auth: string } | null = null;
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const headers = init?.headers as Record<string, string>;
      captured = {
        url: typeof input === "string" ? input : String(input),
        body,
        auth: headers?.Authorization ?? "",
      };
      return new Response(
        JSON.stringify({
          model: "text-embedding-3-small",
          data: [{ embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1), index: 0 }],
          usage: { total_tokens: 7 },
        }),
        { status: 200 },
      );
    };
    const client = new OpenAIEmbeddingsClient({ apiKey: "sk-test", fetchImpl });
    const vectors = await client.embed(["hello"]);

    expect(captured).not.toBeNull();
    expect(captured!.url).toBe("https://api.openai.com/v1/embeddings");
    expect(captured!.auth).toBe("Bearer sk-test");
    expect((captured!.body as { model: string }).model).toBe("text-embedding-3-small");
    expect((captured!.body as { input: string[] }).input).toEqual(["hello"]);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("re-orders responses by .index so they line up with input order", async () => {
    const v0 = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.0);
    const v1 = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.5);
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          model: "text-embedding-3-small",
          // Deliberately out-of-order.
          data: [
            { embedding: v1, index: 1 },
            { embedding: v0, index: 0 },
          ],
        }),
        { status: 200 },
      );
    const client = new OpenAIEmbeddingsClient({ apiKey: "test", fetchImpl });
    const vectors = await client.embed(["a", "b"]);
    expect(vectors[0][0]).toBe(0.0);
    expect(vectors[1][0]).toBe(0.5);
  });

  it("throws when response has a wrong-dimension vector", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: "text-embedding-3-small",
        }),
        { status: 200 },
      );
    const client = new OpenAIEmbeddingsClient({ apiKey: "test", fetchImpl });
    await expect(client.embed(["x"])).rejects.toThrow(/dimension/);
  });

  it("throws when the API returns a non-2xx", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("rate limited", { status: 429 });
    const client = new OpenAIEmbeddingsClient({ apiKey: "test", fetchImpl });
    await expect(client.embed(["x"])).rejects.toThrow(/429/);
  });

  it("throws when count mismatches input length", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              embedding: Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0),
              index: 0,
            },
          ],
          model: "text-embedding-3-small",
        }),
        { status: 200 },
      );
    const client = new OpenAIEmbeddingsClient({ apiKey: "test", fetchImpl });
    await expect(client.embed(["a", "b"])).rejects.toThrow(/expected 2/);
  });
});

describe("constants", () => {
  it("matches the migration's vector(1536) dimension", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
  it("has sane chunk defaults", () => {
    expect(DEFAULT_CHUNK_TARGET_CHARS).toBeGreaterThan(DEFAULT_CHUNK_OVERLAP_CHARS);
    expect(DEFAULT_CHUNK_OVERLAP_CHARS).toBeGreaterThan(0);
  });
});
