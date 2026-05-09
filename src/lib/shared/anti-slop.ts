/**
 * Anti-Slop validator.
 *
 * Enforces the Humanization Manifesto from AGENTS.md against any text the
 * system is about to surface to a user. Every engine that turns LLM output
 * into user-visible content must run its output through this validator.
 *
 * Source of truth: AGENTS.md "The Humanization Manifesto (Anti-Slop Rules)".
 * If you add a rule there, add a corresponding check here and a test in
 * src/engines/voice/voice.test.ts (until a dedicated suite is split out).
 */

export type SlopViolationType =
  | "emoji"
  | "em_dash"
  | "forbidden_word"
  | "forbidden_phrase"
  | "structural_list"
  | "concluding_filler";

export interface SlopViolation {
  type: SlopViolationType;
  /** The exact substring that triggered the rule. */
  match: string;
  /** Zero-based index into the input string. */
  index: number;
  /** Human-readable explanation, suitable for surfacing in errors. */
  reason: string;
}

export interface SlopValidationResult {
  ok: boolean;
  violations: SlopViolation[];
}

const FORBIDDEN_WORDS: readonly string[] = [
  "delve",
  "tapestry",
  "testament",
  "embark",
  "comprehensive",
  "nuances",
  "pivotal",
  "vibrant",
];

const FORBIDDEN_PHRASES: readonly string[] = [
  "in today's digital landscape",
  "in summary",
  "ultimately",
];

const STRUCTURAL_LIST_OPENERS: readonly string[] = [
  "firstly",
  "secondly",
  "finally,",
];

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const EM_DASH_RE = /—/g;

function pushAll(list: SlopViolation[], match: RegExpMatchArray, type: SlopViolationType, reason: string): void {
  list.push({
    type,
    match: match[0],
    index: match.index ?? -1,
    reason,
  });
}

export function validateAntiSlop(text: string): SlopValidationResult {
  const violations: SlopViolation[] = [];

  for (const m of text.matchAll(EMOJI_RE)) {
    pushAll(violations, m, "emoji", "Emojis are prohibited by the Humanization Manifesto.");
  }

  for (const m of text.matchAll(EM_DASH_RE)) {
    pushAll(violations, m, "em_dash", "Em-dashes (—) are prohibited. Use a period, colon, or line break.");
  }

  const lowered = text.toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    const re = new RegExp(`\\b${escapeRegex(word)}\\b`, "g");
    for (const m of lowered.matchAll(re)) {
      violations.push({
        type: "forbidden_word",
        match: text.substr(m.index ?? 0, word.length),
        index: m.index ?? -1,
        reason: `"${word}" is on the forbidden buzzword list.`,
      });
    }
  }

  for (const phrase of FORBIDDEN_PHRASES) {
    const idx = lowered.indexOf(phrase);
    if (idx !== -1) {
      violations.push({
        type: "forbidden_phrase",
        match: text.substr(idx, phrase.length),
        index: idx,
        reason: `"${phrase}" is on the forbidden phrase list.`,
      });
    }
  }

  for (const opener of STRUCTURAL_LIST_OPENERS) {
    const re = new RegExp(`(^|\\n|\\.\\s)${escapeRegex(opener)}`, "gi");
    for (const m of text.matchAll(re)) {
      const matchedPos = (m.index ?? 0) + m[1].length;
      violations.push({
        type: "structural_list",
        match: text.substr(matchedPos, opener.length),
        index: matchedPos,
        reason: `Structural openers like "${opener}" are not allowed.`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

export class SlopError extends Error {
  readonly violations: SlopViolation[];

  constructor(violations: SlopViolation[]) {
    super(
      `Output violates the Humanization Manifesto (slop detected): ${violations
        .map((v) => `${v.type}@${v.index}:${JSON.stringify(v.match)}`)
        .join(", ")}`,
    );
    this.name = "SlopError";
    this.violations = violations;
  }
}

export function assertNoSlop(text: string): void {
  const result = validateAntiSlop(text);
  if (!result.ok) {
    throw new SlopError(result.violations);
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
