/**
 * Minimal, dependency-free diff.
 *
 * Powers the Refine Studio: when the assistant proposes an amended script,
 * the UI renders a diff so the creator can see exactly what changed before
 * accepting. Classic Longest-Common-Subsequence walks give a stable,
 * readable diff without pulling in a diff library.
 *
 * Two granularities:
 *   - `diffLines`     — line-level, good for whole-block structure.
 *   - `diffSentences` — sentence-level (whitespace-preserving). Changing a
 *                       word flags only the sentence it lives in, shown as a
 *                       whole-sentence before/after, while untouched
 *                       sentences stay as plain context. This is what the
 *                       Refine Studio uses for prose.
 */

export type DiffOpType = "equal" | "add" | "remove";

export interface DiffOp {
  type: DiffOpType;
  text: string;
}

/** Normalise CRLF so a pure line-ending change is not reported as edits. */
function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Core LCS diff over two token arrays. Returns ops in reading order,
 * preferring removals before additions when the LCS is ambiguous so the
 * output is deterministic.
 */
function diffTokens(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = length of the LCS of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "remove", text: a[i] });
      i++;
    } else {
      ops.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ type: "remove", text: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ type: "add", text: b[j] });
    j++;
  }
  return ops;
}

function toLines(text: string): string[] {
  return normalise(text).split("\n");
}

/**
 * Diff two blocks of text line by line.
 *
 * An empty string is treated as "no lines" (so adding text to an empty
 * block is all additions, not a phantom edit of a blank line), EXCEPT when
 * both sides are empty, where a single equal blank line is returned so the
 * caller always gets a non-empty result to render.
 */
export function diffLines(oldText: string, newText: string): DiffOp[] {
  let a = toLines(oldText);
  let b = toLines(newText);

  const aEmpty = a.length === 1 && a[0] === "";
  const bEmpty = b.length === 1 && b[0] === "";
  if (aEmpty && !bEmpty) a = [];
  if (bEmpty && !aEmpty) b = [];

  return diffTokens(a, b);
}

/**
 * Split text into sentence tokens. Each token keeps its terminal
 * punctuation and the whitespace that follows it, and runs of newlines are
 * kept as their own tokens, so concatenating the tokens reproduces the
 * original text exactly. A sentence with no terminal punctuation (e.g. a
 * hook) is still emitted as one token.
 */
function toSentences(text: string): string[] {
  const norm = normalise(text);
  const tokens: string[] = [];
  // Keep the newline separators as their own tokens so paragraph breaks
  // survive the round trip.
  for (const part of norm.split(/(\n+)/)) {
    if (part === "") continue;
    if (/^\n+$/.test(part)) {
      tokens.push(part);
      continue;
    }
    // A sentence is any run up to and including its terminal .!? (plus any
    // trailing spaces), or a trailing run with no terminator.
    const sentences = part.match(/[^.!?]*[.!?]+(?:\s+|$)|[^.!?]+$/g);
    if (sentences) tokens.push(...sentences);
    else tokens.push(part);
  }
  return tokens.filter((t) => t.length > 0);
}

/**
 * Diff two blocks of text sentence by sentence. Concatenating every op's
 * `text` reproduces the new text (for adds + equals) or the old text (for
 * removes + equals), so the caller can render whole-sentence before/after
 * blocks while leaving unchanged sentences as context.
 */
export function diffSentences(oldText: string, newText: string): DiffOp[] {
  return diffTokens(toSentences(oldText), toSentences(newText));
}

/** True when the two texts differ (after CRLF normalisation). */
export function hasChanges(oldText: string, newText: string): boolean {
  return normalise(oldText) !== normalise(newText);
}
