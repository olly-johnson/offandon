import { createLogger, timed } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";

import { sanitizeExtractedClientData } from "./sanitize";
import {
  buildIngestionUserPrompt,
  INGESTION_SYSTEM_PROMPT,
} from "./system-prompt";
import {
  CLIENT_ASSET_TYPES,
  MEMORY_CATEGORIES,
  type ClientAssetType,
  type ClientSourceFile,
  type ExtractedClientAsset,
  type ExtractedClientData,
  type ExtractedMemory,
  type MemoryCategory,
} from "./types";

const log = createLogger("ingestion.extractor");

const ASSET_TYPE_SET = new Set<ClientAssetType>(CLIENT_ASSET_TYPES);
const CATEGORY_SET = new Set<MemoryCategory>(MEMORY_CATEGORIES);

export interface IngestionExtractorOptions {
  llm: ILLMClient;
}

export interface IngestionExtractInput {
  clientSlug: string;
  files: ClientSourceFile[];
  nowIso: string;
}

/**
 * One-shot LLM extractor. Unlike the post-chat MemoryEngine this is
 * fail-loud: a parse error or LLM failure throws. Ingestion is an
 * operator-triggered batch job, not a hot path, so the right behavior is
 * to surface the problem and let the operator retry.
 */
export class IngestionExtractor {
  private readonly llm: ILLMClient;

  constructor(opts: IngestionExtractorOptions) {
    this.llm = opts.llm;
  }

  async extract(input: IngestionExtractInput): Promise<ExtractedClientData> {
    const user = buildIngestionUserPrompt({
      clientSlug: input.clientSlug,
      files: input.files,
      nowIso: input.nowIso,
    });

    const raw = await timed(
      log,
      "ingestion.extract",
      () =>
        this.llm.complete({
          system: INGESTION_SYSTEM_PROMPT,
          user,
        }),
      {
        client_slug: input.clientSlug,
        file_count: input.files.length,
        user_chars: user.length,
      },
    );

    return sanitizeExtractedClientData(parseExtractedClientData(raw));
  }
}

/**
 * Strict-ish parse of the LLM output.
 *
 * "Strict-ish" because:
 *   - prose / fenced wrappers around the JSON are tolerated (extracted)
 *   - top-level required slots (profile, voice_dna, source_answers)
 *     missing throws
 *   - per-row malformations in client_assets / user_memories are dropped
 *     silently rather than blowing up the whole extract; one bad asset
 *     shouldn't sink a 50-asset run
 *   - user_methodology missing -> defaults to ""
 *
 * The persistence layer does a second pass of schema-shape validation
 * before any DB writes, so we don't need to be paranoid here.
 */
export function parseExtractedClientData(raw: string): ExtractedClientData {
  const json = extractJsonObject(raw);
  if (!json || typeof json !== "object") {
    throw new Error("ingestion: failed to parse LLM output as JSON object");
  }

  const obj = json as Record<string, unknown>;

  const profile = obj.profile;
  if (!profile || typeof profile !== "object") {
    throw new Error("ingestion: missing or invalid `profile` in extracted data");
  }
  const profileObj = profile as Record<string, unknown>;
  if (typeof profileObj.display_name !== "string" || profileObj.display_name.trim() === "") {
    throw new Error("ingestion: profile.display_name is required");
  }

  if (!obj.voice_dna || typeof obj.voice_dna !== "object") {
    throw new Error("ingestion: missing or invalid `voice_dna` in extracted data");
  }

  if (!obj.source_answers || typeof obj.source_answers !== "object") {
    throw new Error("ingestion: missing or invalid `source_answers` in extracted data");
  }

  const clientAssets = parseClientAssets(obj.client_assets);
  const userMemories = parseUserMemories(obj.user_memories);

  const methodology = typeof obj.user_methodology === "string" ? obj.user_methodology : "";

  return {
    profile: {
      display_name: profileObj.display_name.trim(),
      handle:
        typeof profileObj.handle === "string" && profileObj.handle.trim() !== ""
          ? profileObj.handle.trim()
          : undefined,
    },
    // We trust the LLM to produce the right shape for these two — the
    // persistence layer revalidates against the VoiceDNA / OnboardingAnswers
    // schemas before the DB write.
    voice_dna: obj.voice_dna as ExtractedClientData["voice_dna"],
    source_answers: obj.source_answers as ExtractedClientData["source_answers"],
    client_assets: clientAssets,
    user_memories: userMemories,
    user_methodology: methodology,
  };
}

function parseClientAssets(value: unknown): ExtractedClientAsset[] {
  if (!Array.isArray(value)) return [];
  const out: ExtractedClientAsset[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Record<string, unknown>;

    const type = c.asset_type;
    if (typeof type !== "string" || !ASSET_TYPE_SET.has(type as ClientAssetType)) {
      continue;
    }
    const title = typeof c.title === "string" ? c.title.trim() : "";
    const body = typeof c.body === "string" ? c.body.trim() : "";
    if (title === "" || body === "") continue;

    const metadata =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? (c.metadata as Record<string, unknown>)
        : {};

    out.push({
      asset_type: type as ClientAssetType,
      title,
      body,
      metadata,
      source_file:
        typeof c.source_file === "string" && c.source_file.trim() !== ""
          ? c.source_file.trim()
          : undefined,
    });
  }
  return out;
}

function parseUserMemories(value: unknown): ExtractedMemory[] {
  if (!Array.isArray(value)) return [];
  const out: ExtractedMemory[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const c = candidate as Record<string, unknown>;

    const fact = typeof c.fact === "string" ? c.fact.trim() : "";
    if (fact === "") continue;

    if (typeof c.category !== "string" || !CATEGORY_SET.has(c.category as MemoryCategory)) {
      continue;
    }

    const rawPriority =
      typeof c.priority === "number" && Number.isFinite(c.priority) ? c.priority : 3;
    const priority = Math.max(1, Math.min(5, Math.round(rawPriority)));

    out.push({ fact, category: c.category as MemoryCategory, priority });
  }
  return out;
}

/**
 * Extract the first balanced JSON object from `raw`. Tolerates:
 *   - leading/trailing prose
 *   - ```json fences
 *   - plain JSON with no wrapper
 *
 * Returns the parsed value or null if no JSON object is recoverable.
 */
function extractJsonObject(raw: string): unknown {
  if (raw.trim() === "") return null;

  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  // Strip a markdown fence if present (```json ... ``` or ``` ... ```).
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fall through */
    }
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}
