/**
 * Embeddings client + chunker (BO-049).
 *
 * Provider: OpenAI text-embedding-3-small (1536-d). Chosen because it's
 * fast, cheap ($0.02 / M tokens), and decoupled from the Anthropic chat
 * stack — sharing rate limits with the chat model would let a bursty chat
 * session starve corpus retrieval.
 *
 * The interface is `IEmbeddingsClient` so tests stub it out without
 * touching the network. Production code constructs `OpenAIEmbeddingsClient`
 * once and passes it down to ingestion + retrieval call sites.
 *
 * The chunker is intentionally simple: split on paragraph breaks first,
 * then sentence-ish boundaries, then hard char cut as a last resort. We
 * don't run a real tokenizer — char/4 is close enough for chunk sizing
 * and the actual token count gets logged from the embeddings response.
 */

import { createLogger } from "./logger";

const log = createLogger("embeddings");

export const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * Pinned at the schema level (vector(1536) in migration 20260515000000).
 * Changing this requires a migration — guarded at the type level by the
 * `embedding.length` check before insert.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/** Chunk sizing heuristics. Chars, not tokens; assumes ~4 chars/token. */
export const DEFAULT_CHUNK_TARGET_CHARS = 3200;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 400;
export const MIN_CHUNK_CHARS = 200;

export interface IEmbeddingsClient {
  /**
   * Embed one or more texts. Returns vectors in the same order as input.
   * Throws on dimension mismatch or empty input.
   */
  embed(texts: string[]): Promise<number[][]>;
}

export interface OpenAIEmbeddingsClientOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export class OpenAIEmbeddingsClient implements IEmbeddingsClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIEmbeddingsClientOptions) {
    if (!opts.apiKey) {
      throw new Error("OpenAIEmbeddingsClient: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? EMBEDDING_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error("OpenAIEmbeddingsClient.embed: texts must be non-empty");
    }
    for (const t of texts) {
      if (typeof t !== "string" || t.length === 0) {
        throw new Error("OpenAIEmbeddingsClient.embed: every input must be a non-empty string");
      }
    }

    const startedAt = Date.now();
    const res = await this.fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!res.ok) {
      const errBody = await safeReadBody(res);
      log.error("embeddings request failed", {
        status: res.status,
        body_preview: errBody.slice(0, 200),
      });
      throw new Error(`OpenAI embeddings ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = (await res.json()) as OpenAIEmbeddingResponse;
    if (!Array.isArray(json.data) || json.data.length !== texts.length) {
      throw new Error(
        `OpenAI embeddings: expected ${texts.length} vectors, got ${json.data?.length ?? 0}`,
      );
    }

    // Provider returns in request order but the response also carries an
    // index. We sort defensively so a future API change can't silently
    // misalign embeddings with their source text.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((row, i) => {
      if (!Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `OpenAI embeddings: row ${i} has dimension ${row.embedding?.length}, expected ${EMBEDDING_DIMENSIONS}`,
        );
      }
      return row.embedding;
    });

    log.info("embeddings done", {
      count: texts.length,
      model: json.model,
      total_tokens: json.usage?.total_tokens,
      duration_ms: Date.now() - startedAt,
    });

    return vectors;
  }
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable body>";
  }
}

/* ---------------------------------------------------------------------------
 * Chunking
 * --------------------------------------------------------------------------- */

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
}

export interface TextChunk {
  index: number;
  text: string;
  startOffset: number;
}

/**
 * Split a long text into overlapping chunks for embedding.
 *
 * Strategy: walk through `targetChars`-sized windows, but when the window
 * end falls mid-paragraph or mid-sentence, back up to the nearest natural
 * boundary so chunks don't split a thought in half. Overlap is implemented
 * by stepping the cursor forward by `targetChars - overlapChars` rather
 * than `targetChars`.
 *
 * For very short inputs (< `minChars` after trimming), returns a single
 * chunk so the caller doesn't have to special-case "too small to chunk."
 */
export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const target = opts.targetChars ?? DEFAULT_CHUNK_TARGET_CHARS;
  const overlap = opts.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS;
  const minChars = opts.minChars ?? MIN_CHUNK_CHARS;
  if (target <= 0) throw new Error("chunkText: targetChars must be > 0");
  if (overlap < 0) throw new Error("chunkText: overlapChars must be >= 0");
  if (overlap >= target) {
    throw new Error("chunkText: overlapChars must be smaller than targetChars");
  }

  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= Math.max(target, minChars)) {
    return [{ index: 0, text: trimmed, startOffset: 0 }];
  }

  const step = target - overlap;
  const chunks: TextChunk[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < trimmed.length) {
    const tentativeEnd = Math.min(trimmed.length, cursor + target);
    let end = tentativeEnd;

    if (tentativeEnd < trimmed.length) {
      // Back up to a paragraph break within the back-up window if possible,
      // otherwise to a sentence-ish boundary, otherwise leave the hard cut.
      const backupFloor = cursor + Math.floor(target / 2);
      const paraBreak = trimmed.lastIndexOf("\n\n", tentativeEnd);
      if (paraBreak >= backupFloor) {
        end = paraBreak;
      } else {
        const sentenceBreak = findLastSentenceBoundary(trimmed, backupFloor, tentativeEnd);
        if (sentenceBreak >= backupFloor) {
          end = sentenceBreak;
        }
      }
    }

    const piece = trimmed.slice(cursor, end).trim();
    if (piece.length >= minChars || chunks.length === 0) {
      chunks.push({ index: chunkIndex++, text: piece, startOffset: cursor });
    } else {
      // Tail too small to stand alone — fold into previous chunk.
      const prev = chunks[chunks.length - 1];
      prev.text = `${prev.text}\n${piece}`.trim();
    }

    if (end >= trimmed.length) break;
    cursor = Math.max(end - overlap, cursor + step);
  }

  return chunks;
}

function findLastSentenceBoundary(text: string, lo: number, hi: number): number {
  // Look for ". ", "! ", "? " (and end-of-paragraph variants) in [lo, hi).
  for (let i = hi - 1; i >= lo; i--) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      if (next === undefined || next === " " || next === "\n") {
        return i + 1;
      }
    }
  }
  return -1;
}
