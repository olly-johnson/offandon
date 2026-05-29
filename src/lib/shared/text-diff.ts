/**
 * Minimal, dependency-free diff.
 *
 * Powers the Refine Studio: when the assistant proposes an amended script,
 * the UI renders a diff so the creator can see exactly what changed before
 * accepting. Classic Longest-Common-Subsequence walks give a stable,
 * readable diff without pulling in a diff library.
 *
 * Two granularities:
 *   - `diffLines`  — line-level, good for whole-block structure.
 *   - `diffWords`  — word-level (whitespace-preserving), so changing one
 *                    word in a paragraph highlights only that word instead
 *                    of flagging the whole paragraph. This is what the
 *                    Refine Studio uses for prose.
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
 * Split text into word + whitespace tokens, keeping whitespace runs as
 * their own tokens so the original text can be reconstructed faithfully
 * (newlines and spaces survive the round trip).
 */
function toWords(text: string): string[] {
  return normalise(text).match(/\s+|\S+/g) ?? [];
}

/**
 * Diff two blocks of text word by word. Whitespace is preserved as tokens,
 * so concatenating every op's `text` reproduces the new text exactly (for
 * adds + equals) or the old text (for removes + equals). Changing a single
 * word in a long paragraph yields a tiny add/remove pair instead of
 * flagging the entire paragraph.
 */
export function diffWords(oldText: string, newText: string): DiffOp[] {
  return diffTokens(toWords(oldText), toWords(newText));
}

/** True when the two texts differ (after CRLF normalisation). */
export function hasChanges(oldText: string, newText: string): boolean {
  return normalise(oldText) !== normalise(newText);
}
