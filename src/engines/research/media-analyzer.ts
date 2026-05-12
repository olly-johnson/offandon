import { createLogger, timed } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import {
  buildAnalysisUserPrompt,
  RESEARCH_ANALYSIS_SYSTEM_PROMPT,
} from "./system-prompt";
import {
  PERFORMANCE_LABELS,
  type LibraryStats,
  type MediaAnalysis,
  type MediaAnalysisInput,
  type PerformanceLabel,
} from "./types";

const log = createLogger("research.analyzer");

const PERF_SET = new Set<PerformanceLabel>(PERFORMANCE_LABELS);

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

  const performance =
    typeof obj.performance_label === "string" &&
    PERF_SET.has(obj.performance_label as PerformanceLabel)
      ? (obj.performance_label as PerformanceLabel)
      : null;

  return {
    hook: stringOrNull(obj.hook),
    structure: stringOrNull(obj.structure),
    pillar_match: stringOrNull(obj.pillar_match),
    performance_label: performance,
    what_worked: stringOrNull(obj.what_worked),
    what_to_repeat: stringOrNull(obj.what_to_repeat),
  };
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
