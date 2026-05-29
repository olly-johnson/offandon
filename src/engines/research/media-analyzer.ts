import { sanitizeString } from "@/engines/ingestion/sanitize";
import { createLogger, timed } from "@/lib/shared/logger";
import type { ILLMClient } from "@/engines/voice/voice";
import type { VoiceDNA } from "@/engines/voice/types";

import {
  buildAnalysisUserPrompt,
  RESEARCH_ANALYSIS_SYSTEM_PROMPT,
} from "./system-prompt";
import {
  isHookType,
  PERFORMANCE_SCORE_MAX,
  PERFORMANCE_SCORE_MIN,
  type HookType,
  type LibraryStats,
  type MediaAnalysis,
  type MediaAnalysisInput,
} from "./types";

const log = createLogger("research.analyzer");

/**
 * Stand-in transcript for a reel that carries no speech (music-only or
 * purely visual). Deepgram returns a blank transcript for these; we
 * substitute this note so the model knows to read structure from the
 * caption and metrics, and store it as the transcript (both analysis
 * tables CHECK that transcript is not blank). No em-dashes: this
 * renders in the Transcript tab as site copy.
 */
export const NO_SPEECH_TRANSCRIPT =
  "(No speech detected. This reel is music or visual only; analysis is based on the caption and metrics.)";

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
    const trimmed = input.transcript.trim();
    // A blank transcript means a no-speech reel (music/visual only). We
    // still analyze it from caption + metrics rather than failing the
    // run; substitute a note the model can read and that we can store.
    const hasSpeech = trimmed.length > 0;
    if (!hasSpeech) {
      log.info("research.analyze: no-speech reel, analyzing from caption + metrics");
    }
    const transcript = hasSpeech ? trimmed : NO_SPEECH_TRANSCRIPT;

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
    hook_type: hookTypeOrNull(obj.hook_type),
    structure: cleanOrNull(obj.structure),
    pillar_match: cleanOrNull(obj.pillar_match),
    performance_score: scoreOrNull(obj.performance_score),
    what_worked: cleanOrNull(obj.what_worked),
    what_to_repeat: cleanOrNull(obj.what_to_repeat),
  };
}

function hookTypeOrNull(v: unknown): HookType | null {
  // Model occasionally lowercases or pads the label; normalise then
  // accept only the known taxonomy, else null (no fabrication).
  if (typeof v !== "string") return null;
  const upper = v.trim().toUpperCase();
  return isHookType(upper) ? upper : null;
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
