import type { VoiceDNA } from "@/engines/voice/types";

import type {
  LibraryStats,
  MediaAnalysisInput,
} from "./types";

export const RESEARCH_ANALYSIS_MODEL = "claude-sonnet-4-6";

/** Safely under the SDK's 21,333-token non-streaming threshold (BO-042
 *  scaling lesson). Real analyses land ~1-3K tokens; this gives a
 *  comfortable buffer. */
export const RESEARCH_ANALYSIS_MAX_TOKENS = 8_000;

/**
 * System prompt for the per-video structural analysis pass.
 *
 * Schema-first: model returns one JSON object matching MediaAnalysis.
 * Null is explicitly allowed for fields where the transcript doesn't
 * support a confident read; fabricating to fill a slot is worse than
 * leaving it null.
 */
export const RESEARCH_ANALYSIS_SYSTEM_PROMPT = `You are the Research Analyst for Bot OS. You receive ONE short-form video the creator has already published: its transcript, caption, engagement metrics, and where it sits within the creator's own library by reach. Produce a structural analysis the creator can use to repeat what worked.

Hard rules:
- Output ONE JSON object matching the schema below. No prose, no markdown fences, no commentary.
- Quote verbatim from the transcript for the "hook" field. Do not paraphrase.
- If the transcript is too short, mumbled, or non-content (e.g. background music only, voiceover ad) to read structure from, set the field to null. Do not fabricate.
- "pillar_match" must be the exact name of one of the creator's pillars passed in the user message, or null if no pillar fits.
- "performance_score" is an INTEGER 0-10 reflecting how well this video performed relative to the rest of this creator's library by reach. Use the library stats passed in the user message: reach >= p80 -> 8, 9 or 10; reach > median -> 6 or 7; reach near median -> 5; reach < median -> 3 or 4; reach <= p20 -> 0, 1 or 2. Set to null if the library sample is too small (sample_size < 5) or this video has no reach figure to compare.
- Be specific. "Hook is engaging" is useless. "Hook uses a numbered list opener (3 things) before the topic is named, forcing a curiosity gap" is useful.
- "what_to_repeat" is one sentence: the single reusable lesson. If you can't isolate one, set to null.

Schema (top-level keys are required even when value is null):

{
  "hook": string | null,
  "structure": string | null,
  "pillar_match": string | null,
  "performance_score": integer 0-10 | null,
  "what_worked": string | null,
  "what_to_repeat": string | null
}

Return ONLY the JSON object.`;

/**
 * Build the user message for the analysis call. The transcript +
 * metrics + library stats + voice context are concatenated with clear
 * delimiters so the model can address each as a labelled input.
 */
export function buildAnalysisUserPrompt(args: {
  voiceDna: VoiceDNA;
  libraryStats: LibraryStats;
  media: MediaAnalysisInput;
  transcript: string;
}): string {
  const pillars = args.voiceDna.content_pillars.map((p) => p.name).join(", ");
  const stats = args.libraryStats;
  return [
    "Creator pillars (for pillar_match): " + (pillars || "(none defined)"),
    "Creator tone: " + args.voiceDna.tone_profile.primary,
    "",
    "Library stats (this creator's own reach distribution):",
    `  sample_size: ${stats.sample_size}`,
    `  p20_reach:   ${stats.p20_reach ?? "n/a"}`,
    `  median:      ${stats.median_reach ?? "n/a"}`,
    `  p80_reach:   ${stats.p80_reach ?? "n/a"}`,
    "",
    "This video's metrics:",
    `  reach:          ${args.media.reach ?? "n/a"}`,
    `  plays:          ${args.media.plays ?? "n/a"}`,
    `  like_count:     ${args.media.like_count ?? "n/a"}`,
    `  comments_count: ${args.media.comments_count ?? "n/a"}`,
    `  saved:          ${args.media.saved ?? "n/a"}`,
    `  shares:         ${args.media.shares ?? "n/a"}`,
    `  posted_at:      ${args.media.posted_at ?? "n/a"}`,
    "",
    "Caption:",
    args.media.caption ?? "(no caption)",
    "",
    "Transcript:",
    args.transcript,
    "",
    "Return ONLY the JSON object specified in the system prompt.",
  ].join("\n");
}
