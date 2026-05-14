import { describe, expect, it } from "vitest";

import { stripChatMarkdown } from "./markdown-strip";

describe("stripChatMarkdown", () => {
  it("removes ** bold markers and keeps the inner text", () => {
    expect(stripChatMarkdown("**hello**")).toBe("hello");
    expect(stripChatMarkdown("**hello world**")).toBe("hello world");
    expect(stripChatMarkdown("this is **bold** text")).toBe("this is bold text");
    expect(stripChatMarkdown("**one** and **two**")).toBe("one and two");
  });

  it("removes __ bold markers and keeps the inner text", () => {
    expect(stripChatMarkdown("__hello__")).toBe("hello");
    expect(stripChatMarkdown("this is __bold__ text")).toBe("this is bold text");
  });

  it("strips a line that is only --- (horizontal rule)", () => {
    expect(stripChatMarkdown("first\n---\nsecond")).toBe("first\n\nsecond");
    expect(stripChatMarkdown("first\n  ---  \nsecond")).toBe("first\n\nsecond");
    expect(stripChatMarkdown("first\n------\nsecond")).toBe("first\n\nsecond");
  });

  it("strips ATX heading markers but keeps the heading text", () => {
    expect(stripChatMarkdown("## Heading\nbody")).toBe("Heading\nbody");
    expect(stripChatMarkdown("### Sub heading\nbody")).toBe("Sub heading\nbody");
    expect(stripChatMarkdown("# Top\nbody")).toBe("Top\nbody");
  });

  it("collapses runs of blank lines created by removed separators", () => {
    expect(stripChatMarkdown("a\n\n---\n\nb")).toBe("a\n\nb");
  });

  it("leaves plain prose untouched", () => {
    const input =
      "Lead with a specific moment. Numbers, not adjectives. Then ship it.";
    expect(stripChatMarkdown(input)).toBe(input);
  });

  it("does not eat a lone asterisk used as multiplication or bullet", () => {
    expect(stripChatMarkdown("5 * 5 = 25")).toBe("5 * 5 = 25");
    expect(stripChatMarkdown("- list item")).toBe("- list item");
  });

  it("returns an empty string unchanged", () => {
    expect(stripChatMarkdown("")).toBe("");
  });

  it("preserves trailing newline behavior by trimming the final result", () => {
    expect(stripChatMarkdown("  **hi**  ")).toBe("hi");
  });
});
