/**
 * Research Engine: per-video analysis types.
 *
 * Workflow: media row from instagram_media -> Deepgram transcript ->
 * Sonnet structural analysis -> MediaAnalysis row in
 * instagram_media_analysis. The script generator pulls "Save as
 * reference" winners through client_assets[past_script], not from this
 * table directly, so the analysis output is for human consumption.
 */

export type PerformanceLabel =
  | "top"
  | "above_median"
  | "median"
  | "below_median"
  | "bottom";

export const PERFORMANCE_LABELS: PerformanceLabel[] = [
  "top",
  "above_median",
  "median",
  "below_median",
  "bottom",
];

/**
 * Aggregate library stats. Computed at analysis time from the user's
 * own media rows. Used by the analyzer to label this video's
 * performance relative to the rest of the creator's library.
 */
export interface LibraryStats {
  median_reach: number | null;
  /** 20th percentile reach. Anything <= this is "bottom". */
  p20_reach: number | null;
  /** 80th percentile reach. Anything >= this is "top". */
  p80_reach: number | null;
  /** Number of media rows the stats were computed from. */
  sample_size: number;
}

/**
 * The structured LLM output. Mirrors columns on
 * instagram_media_analysis. The hook/structure/etc. fields are
 * optional because a borderline video (e.g. very short, mumbled) may
 * not yield a clean structural read; we'd rather store transcript +
 * null analysis than fabricate fields.
 */
export interface MediaAnalysis {
  /** Verbatim Deepgram transcript. Required; no analysis lands without it. */
  transcript: string;
  hook: string | null;
  structure: string | null;
  pillar_match: string | null;
  performance_label: PerformanceLabel | null;
  what_worked: string | null;
  what_to_repeat: string | null;
}

export interface MediaAnalysisInput {
  caption: string | null;
  reach: number | null;
  plays: number | null;
  like_count: number | null;
  comments_count: number | null;
  saved: number | null;
  shares: number | null;
  posted_at: string | null;
}

export interface ITranscriptionClient {
  /**
   * Returns plain-text transcript for the supplied audio. Implementations
   * decide format (we'll feed an mp4 buffer for v1; Deepgram accepts that).
   */
  transcribe(audio: ArrayBuffer | Uint8Array): Promise<TranscriptionResult>;
  /** Stable identifier for the provider+model pinned in the DB row. */
  readonly modelId: string;
}

export interface TranscriptionResult {
  text: string;
  /** Optional: duration in seconds, returned by Deepgram. */
  duration_seconds?: number | null;
}
