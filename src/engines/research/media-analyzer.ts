import { sanitizeString } from "@/engines/ingestion/sanitize";
import { createLogger, timed } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import {
  buildAnalysisUserPrompt,
  RESEARCH_ANALYSIS_SYSTEM_PROMPT,
} from "./system-prompt";
import {
  PERFORMANCE_SCORE_MAX,
  PERFORMANCE_SCORE_MIN,
  type LibraryStats,
  type MediaAnalysis,
  type MediaAnalysisInput,
} from "./types";

const log = createLogger("research.analyzer");

export interface MediaAnalyzerOptions {
  llm: ILLMClient;
}

export interface MediaAnalyzeInput {
  voiceDna: VoiceDNA;
  libraryStats: LibraryStats;
  media: MediaAnalysisInput;
  transcript: string;
}

export class MediaAnalyzer {
  private readonly llm: ILLMClient;

  constructor(opts: MediaAnalyzerOptions) {
    this.llm = opts.llm;
  }

  async analyze(input: MediaAnalyzeInput): Promise<MediaAnalysis> {
    const transcript = input.transcript.trim();
    if (transcript.length === 0) {
      throw new Error("MediaAnalyzer: transcript is empty; refusing to analyze");
    }

    const user = buildAnalysisUserPrompt({
      voiceDna: input.voiceDna,
      libraryStats: input.libraryStats,
      media: input.media,
      transcript,
    });

    const raw = await timed(
      log,
      "research.analyze",
      () =>
        this.llm.complete({
          system: RESEARCH_ANALYSIS_SYSTEM_PROMPT,
          user,
        }),
      {
        user_chars: user.length,
        transcript_chars: transcript.length,
      },
    );

    const parsed = parseAnalysisJson(raw);
    return { ...parsed, transcript };
  }
}

type ParsedAnalysis = Omit<MediaAnalysis, "transcript">;

export function parseAnalysisJson(raw: string): ParsedAnalysis {
  const value = extractJsonObject(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("research: failed to parse LLM output as JSON object");
  }
  const obj = value as Record<string, unknown>;

  // Sanitise every model-emitted string at the parse layer. Sonnet
  // happily ships em-dashes in research prose despite our broader
  // anti-em-dash policy; running the same sanitiser the ingestion
  // pipeline uses (em-dash -> ", ", en-dash between words -> ", ")
  // means analyses render clean in the UI without each consumer
  // needing to remember to do it.
  return {
    hook: cleanOrNull(obj.hook),
    structure: cleanOrNull(obj.structure),
    pillar_match: cleanOrNull(obj.pillar_match),
    performance_score: scoreOrNull(obj.performance_score),
    what_worked: cleanOrNull(obj.what_worked),
    what_to_repeat: cleanOrNull(obj.what_to_repeat),
  };
}

function cleanOrNull(v: unknown): string | null {
  const s = stringOrNull(v);
  return s === null ? null : sanitizeString(s);
}

function scoreOrNull(v: unknown): number | null {
  // Accept int or numeric string (Sonnet sometimes returns quoted
  // numbers despite the schema), clamp into 0-10, refuse anything
  // outside that range or non-finite.
  let n: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) {
    n = v;
  } else if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number.parseFloat(v);
    if (Number.isFinite(parsed)) n = parsed;
  }
  if (n === null) return null;
  const rounded = Math.round(n);
  if (rounded < PERFORMANCE_SCORE_MIN || rounded > PERFORMANCE_SCORE_MAX) {
    return null;
  }
  return rounded;
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function extractJsonObject(raw: string): unknown {
  if (raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fallthrough */
  }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fallthrough */
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
