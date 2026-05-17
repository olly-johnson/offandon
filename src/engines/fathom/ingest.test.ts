import { describe, expect, it, vi } from "vitest";

import * as corpus from "@/engines/corpus";
import type { IEmbeddingsClient } from "@/lib/shared/embeddings";

import { buildIngestBody, fathomSourcePath, ingestFathomRecording } from "./ingest";
import type { FathomRecording } from "./types";

const baseRecording: FathomRecording = {
  recordingId: "rec_42",
  title: "Coaching call with Alice",
  startedAt: "2026-05-17T15:00:00Z",
  durationSeconds: 1800,
  invitees: [
    { email: "olly@example.com", name: "Olly", isExternal: false },
    { email: "alice@client.com", name: "Alice", isExternal: true },
  ],
  recordedByEmail: "olly@example.com",
  transcript: [
    { speaker: "Olly", speakerEmail: "olly@example.com", text: "hello", timestamp: "00:00" },
    { speaker: "Alice", speakerEmail: null, text: "hi there", timestamp: "00:01" },
  ],
  transcriptPlaintext: "Olly: hello\nAlice: hi there",
  shareUrl: "https://fathom.video/calls/rec_42",
  summary: "Caught up on Q2 plans.",
};

describe("buildIngestBody", () => {
  it("includes title, started, attendees, summary, and transcript", () => {
    const body = buildIngestBody(baseRecording);
    expect(body).toContain("Title: Coaching call with Alice");
    expect(body).toContain("Started: 2026-05-17T15:00:00Z");
    expect(body).toContain("Olly <olly@example.com>");
    expect(body).toContain("Alice <alice@client.com>");
    expect(body).toContain("Summary:");
    expect(body).toContain("Caught up on Q2 plans.");
    expect(body).toContain("Transcript:");
    expect(body).toContain("Olly: hello");
  });

  it("omits the summary block when no summary is present", () => {
    const body = buildIngestBody({ ...baseRecording, summary: undefined });
    expect(body).not.toContain("Summary:");
    expect(body).toContain("Transcript:");
  });
});

describe("fathomSourcePath", () => {
  it("prefixes the recording id", () => {
    expect(fathomSourcePath("rec_42")).toBe("fathom://rec_42");
  });
});

describe("ingestFathomRecording", () => {
  it("saves a document and replaces its chunks", async () => {
    const saveSpy = vi
      .spyOn(corpus, "saveClientDocument")
      .mockResolvedValue({
        id: "doc-uuid",
        user_id: "user-uuid",
        source_type: "fathom_transcript",
        title: baseRecording.title,
        body: "ignored",
        captured_at: baseRecording.startedAt,
        source_path: "fathom://rec_42",
        metadata: {},
      });
    const replaceSpy = vi
      .spyOn(corpus, "replaceDocumentChunks")
      .mockResolvedValue();

    const embed = vi.fn<IEmbeddingsClient["embed"]>(async (texts) =>
      texts.map(() => Array(1024).fill(0.01) as number[]),
    );
    const embeddings: IEmbeddingsClient = { embed };

    const result = await ingestFathomRecording(
      { supabase: {} as never, embeddings },
      { userId: "user-uuid", recording: baseRecording },
    );

    expect(result.documentId).toBe("doc-uuid");
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.sourcePath).toBe("fathom://rec_42");

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const saveArg = saveSpy.mock.calls[0]![1];
    expect(saveArg.user_id).toBe("user-uuid");
    expect(saveArg.source_type).toBe("fathom_transcript");
    expect(saveArg.source_path).toBe("fathom://rec_42");
    expect(saveArg.captured_at).toBe(baseRecording.startedAt);
    expect(saveArg.metadata?.recording_id).toBe("rec_42");

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const replaceArgs = replaceSpy.mock.calls[0]!;
    expect(replaceArgs[1]).toBe("doc-uuid");
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed.mock.calls[0]![1]).toEqual({ inputType: "document" });

    saveSpy.mockRestore();
    replaceSpy.mockRestore();
  });

  it("throws when the embedder returns the wrong number of vectors", async () => {
    const saveSpy = vi
      .spyOn(corpus, "saveClientDocument")
      .mockResolvedValue({
        id: "doc-uuid",
        user_id: "user-uuid",
        source_type: "fathom_transcript",
        title: baseRecording.title,
        body: "",
        captured_at: baseRecording.startedAt,
        source_path: "fathom://rec_42",
        metadata: {},
      });
    vi.spyOn(corpus, "replaceDocumentChunks").mockResolvedValue();

    const embeddings: IEmbeddingsClient = {
      embed: vi.fn<IEmbeddingsClient["embed"]>(async () => [
        Array(1024).fill(0) as number[],
      ]),
    };

    await expect(
      ingestFathomRecording(
        { supabase: {} as never, embeddings },
        {
          userId: "user-uuid",
          recording: { ...baseRecording, transcriptPlaintext: "a".repeat(10000) },
          chunkTargetChars: 1000,
          chunkOverlapChars: 100,
        },
      ),
    ).rejects.toThrow(/embedder returned/);

    saveSpy.mockRestore();
  });
});
