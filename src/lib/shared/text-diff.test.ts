import { describe, expect, it } from "vitest";

import { diffLines, diffSentences, hasChanges } from "./text-diff";

describe("diffLines", () => {
  it("marks every line equal when the texts match", () => {
    const ops = diffLines("a\nb\nc", "a\nb\nc");
    expect(ops).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
      { type: "equal", text: "c" },
    ]);
  });

  it("flags an inserted line as add and leaves the rest equal", () => {
    const ops = diffLines("a\nc", "a\nb\nc");
    expect(ops).toEqual([
      { type: "equal", text: "a" },
      { type: "add", text: "b" },
      { type: "equal", text: "c" },
    ]);
  });

  it("flags a removed line as remove and leaves the rest equal", () => {
    const ops = diffLines("a\nb\nc", "a\nc");
    expect(ops).toEqual([
      { type: "equal", text: "a" },
      { type: "remove", text: "b" },
      { type: "equal", text: "c" },
    ]);
  });

  it("represents a changed line as a remove followed by an add", () => {
    const ops = diffLines("hook line\nold body", "hook line\nnew body");
    expect(ops).toEqual([
      { type: "equal", text: "hook line" },
      { type: "remove", text: "old body" },
      { type: "add", text: "new body" },
    ]);
  });

  it("treats an empty original as all additions", () => {
    expect(diffLines("", "a\nb")).toEqual([
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
  });

  it("treats an empty replacement as all removals", () => {
    expect(diffLines("a\nb", "")).toEqual([
      { type: "remove", text: "a" },
      { type: "remove", text: "b" },
    ]);
  });

  it("two empty strings produce a single equal empty line", () => {
    expect(diffLines("", "")).toEqual([{ type: "equal", text: "" }]);
  });

  it("preserves blank lines so paragraph spacing survives the diff", () => {
    const ops = diffLines("p1\n\np2", "p1\n\np2\n\np3");
    expect(ops).toEqual([
      { type: "equal", text: "p1" },
      { type: "equal", text: "" },
      { type: "equal", text: "p2" },
      { type: "add", text: "" },
      { type: "add", text: "p3" },
    ]);
  });

  it("normalises CRLF so a pure line-ending change is not reported as edits", () => {
    const ops = diffLines("a\r\nb", "a\nb");
    expect(ops).toEqual([
      { type: "equal", text: "a" },
      { type: "equal", text: "b" },
    ]);
  });

  it("reports whether anything changed via the helper", () => {
    expect(diffLines("a\nb", "a\nb").some((o) => o.type !== "equal")).toBe(false);
    expect(diffLines("a\nb", "a\nc").some((o) => o.type !== "equal")).toBe(true);
  });
});

describe("diffSentences", () => {
  it("flags only the changed sentence, leaving the others equal", () => {
    const oldText =
      "It is the discovery call. They lead with credentials. Reverse the order.";
    const newText =
      "It is the discovery call. They lead with credentials. Flip the order entirely.";
    const ops = diffSentences(oldText, newText);

    // The two untouched sentences stay equal; only the last one is a
    // remove + add pair (a whole-sentence before/after).
    expect(ops.filter((o) => o.type === "equal").map((o) => o.text.trim())).toEqual([
      "It is the discovery call.",
      "They lead with credentials.",
    ]);
    expect(ops.find((o) => o.type === "remove")?.text.trim()).toBe("Reverse the order.");
    expect(ops.find((o) => o.type === "add")?.text.trim()).toBe(
      "Flip the order entirely.",
    );
  });

  it("does not flag a sentence whose words are unchanged", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const ops = diffSentences(text, text);
    expect(ops.every((o) => o.type === "equal")).toBe(true);
  });

  it("reconstructs the new text from equal + add tokens", () => {
    const oldText = "One. Two. Three.";
    const newText = "One. Two changed. Three.";
    const rebuilt = diffSentences(oldText, newText)
      .filter((o) => o.type !== "remove")
      .map((o) => o.text)
      .join("");
    expect(rebuilt).toBe(newText);
  });

  it("reconstructs the old text from equal + remove tokens", () => {
    const oldText = "One. Two. Three.";
    const newText = "One. Two changed. Three.";
    const rebuilt = diffSentences(oldText, newText)
      .filter((o) => o.type !== "add")
      .map((o) => o.text)
      .join("");
    expect(rebuilt).toBe(oldText);
  });

  it("keeps paragraph breaks so a multi-paragraph script round-trips", () => {
    const oldText = "Hook line.\n\nFirst paragraph. Second paragraph.";
    const newText = "Hook line.\n\nFirst paragraph. A new second paragraph.";
    const ops = diffSentences(oldText, newText);
    expect(ops.some((o) => o.text.includes("\n\n"))).toBe(true);
    const rebuilt = ops
      .filter((o) => o.type !== "remove")
      .map((o) => o.text)
      .join("");
    expect(rebuilt).toBe(newText);
  });

  it("handles a sentence with no terminal punctuation (e.g. a hook)", () => {
    const ops = diffSentences("Most coaches lose leads", "Most founders lose leads");
    expect(ops.find((o) => o.type === "remove")?.text).toBe("Most coaches lose leads");
    expect(ops.find((o) => o.type === "add")?.text).toBe("Most founders lose leads");
  });

  it("treats two empty strings as no change", () => {
    expect(diffSentences("", "")).toEqual([]);
  });
});

describe("hasChanges", () => {
  it("is false for identical text and true for any edit", () => {
    expect(hasChanges("a b c", "a b c")).toBe(false);
    expect(hasChanges("a b c", "a b d")).toBe(true);
  });

  it("ignores pure CRLF differences", () => {
    expect(hasChanges("a\r\nb", "a\nb")).toBe(false);
  });
});
