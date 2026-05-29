import { describe, expect, it } from "vitest";

import { diffLines } from "./text-diff";

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
