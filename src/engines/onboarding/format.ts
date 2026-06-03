/**
 * Turn raw onboarding form answers into a single source document for the
 * ingestion extractor (BO-081).
 *
 * The Google Form delivers answers keyed by question title. The existing
 * `IngestionExtractor` already converts a free-text client document into a
 * full Voice DNA (profile + voice_dna + assets + memories), so onboarding
 * just formats the Q&A into one readable document and hands it over —
 * exactly like an operator-ingested client file, but sourced from the form.
 */

import type { ClientSourceFile } from "@/engines/ingestion";

/** Keys that aren't real questions (collected separately or housekeeping). */
const NON_QUESTION_KEYS = new Set([
  "email",
  "respondentemail",
  "submitted_at",
  "submittedat",
  "timestamp",
]);

/**
 * Render the answers as a titled Q&A document. Skips control fields and
 * blank answers. Stable order = insertion order of the answers object.
 */
export function buildIdentityDocument(
  answers: Record<string, string>,
  displayName?: string | null,
): string {
  const lines: string[] = ["# Off&On Identity Foundation"];
  if (displayName && displayName.trim()) {
    lines.push(`Member: ${displayName.trim()}`);
  }
  lines.push("");

  for (const [question, answer] of Object.entries(answers)) {
    if (NON_QUESTION_KEYS.has(question.toLowerCase().trim())) continue;
    const value = (answer ?? "").trim();
    if (value === "") continue;
    lines.push(`## ${question.trim()}`);
    lines.push(value);
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

/**
 * Best-effort display name from the answers. The form's name question is
 * "What's your name and where are you based?"; we take the leading clause.
 */
export function extractDisplayName(answers: Record<string, string>): string | null {
  for (const [question, answer] of Object.entries(answers)) {
    const q = question.toLowerCase();
    if ((q.includes("name") && q.includes("based")) || q.startsWith("full name")) {
      const v = (answer ?? "").trim();
      if (v) {
        // "Cohen Denniss, London" -> "Cohen Denniss"
        return v.split(/[,\n]/)[0].trim() || null;
      }
    }
  }
  return null;
}

/** Wrap the formatted document as the single ClientSourceFile the extractor expects. */
export function buildIdentitySourceFiles(
  answers: Record<string, string>,
  displayName?: string | null,
): ClientSourceFile[] {
  return [
    {
      relativePath: "identity-foundation.md",
      body: buildIdentityDocument(answers, displayName),
    },
  ];
}
