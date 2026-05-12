/**
 * Post-extraction sanitization.
 *
 * Strips characters that leak into downstream system prompts and trip
 * the UI / generation anti-slop gates. Same em-dash rule as
 * `sanitizeFactText` in memory-engine, applied recursively to every
 * string in the extracted artifact.
 *
 * Why ", " (comma+space) instead of memory's ". " (period+space):
 * memory facts are short atomic strings where ". " survives fine.
 * Ingestion output carries dense prose (voice samples, audience persona
 * paragraphs, methodology overlays). ". " inside a sentence produces
 * orphan lowercase fragments; ", " preserves the comma-style usage
 * em-dashes typically replace.
 *
 * Keys are NOT touched (asset_type values, category enum strings, etc.
 * are stable identifiers, not prose).
 */

import type { ExtractedClientData } from "./types";

// Consume surrounding spaces with the dash itself so "X — Y" becomes
// "X, Y" rather than "X , Y". \s* is greedy and will also eat newlines,
// but em-dashes inside ingestion strings never cross line breaks.
const EM_DASH_RE = / *— */g;
const EN_DASH_BETWEEN_WORDS_RE = /(\S)\s*–\s*(\S)/g;
const MULTI_SPACE_RE = /[ \t]{2,}/g;

/** Public: replace em/en dashes used as punctuation in a single string. */
export function sanitizeString(s: string): string {
  return s
    .replace(EM_DASH_RE, ", ")
    .replace(EN_DASH_BETWEEN_WORDS_RE, "$1, $2")
    .replace(MULTI_SPACE_RE, " ");
}

/**
 * Recursively sanitize every string in a JSON-like value. Arrays and
 * plain objects are walked; primitives other than strings pass through.
 * Returns a new value; does not mutate input.
 */
export function sanitizeValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeValue(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** Public: sanitize a full ExtractedClientData artifact. */
export function sanitizeExtractedClientData(
  data: ExtractedClientData,
): ExtractedClientData {
  return sanitizeValue(data);
}
