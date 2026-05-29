/**
 * Minimal, dependency-free line diff.
 *
 * Powers the Refine Studio: when the assistant proposes an amended script,
 * the UI renders `diffLines(current, proposed)` so the creator can see what
 * changed before accepting. A classic Longest-Common-Subsequence walk gives
 * a stable, readable line-level diff without pulling in a diff library.
 */

export type DiffOpType = "equal" | "add" | "remove";

export interface DiffOp {
  type: DiffOpType;
  text: string;
}

function toLines(text: string): string[] {
  // Normalise CRLF so a pure line-ending change is not reported as edits.
  return text.replace(/\r\n/g, "\n").split("\n");
}

/**
 * Diff two blocks of text line by line.
 *
 * An empty string is treated as "no lines" (so adding text to an empty
 * script is all additions, not a phantom edit of a blank line), EXCEPT when
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

/** Convenience: true when the two texts differ (after CRLF normalisation). */
export function hasChanges(oldText: string, newText: string): boolean {
  return diffLines(oldText, newText).some((o) => o.type !== "equal");
}
