import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateAntiSlop } from "./anti-slop";

/**
 * Methodology docs (docs/methodology/*.md) are loaded VERBATIM into LLM
 * system prompts via the same extractSection pattern as the Humanization
 * Manifesto. Anything in those files that violates the Manifesto teaches
 * the model bad humanisation signals.
 *
 * This test enforces the contract: every methodology doc must pass the
 * shared anti-slop validator. Adding an em-dash, an emoji, a forbidden
 * buzzword, or a forbidden phrase to any of these files fails CI.
 *
 * Note: en-dashes (–, U+2013) used for numeric ranges (180-250 words) are
 * NOT em-dashes (—, U+2014) and are intentionally allowed.
 */

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    try {
      readFileSync(join(dir, "package.json"), "utf-8");
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error("Could not locate repo root from " + import.meta.url);
      }
      dir = parent;
    }
  }
}

const METHODOLOGY_DIR = resolve(findRepoRoot(), "docs", "methodology");

function loadMethodologyDocs(): Array<{ name: string; content: string }> {
  return readdirSync(METHODOLOGY_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(resolve(METHODOLOGY_DIR, name), "utf-8"),
    }));
}

describe("methodology docs anti-slop contract", () => {
  const docs = loadMethodologyDocs();

  it("loads at least one methodology doc", () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it.each(docs)("$name passes the anti-slop validator", ({ content }) => {
    const result = validateAntiSlop(content);
    if (!result.ok) {
      const summary = result.violations
        .slice(0, 10)
        .map((v) => `  ${v.type}@${v.index}: ${JSON.stringify(v.match)} (${v.reason})`)
        .join("\n");
      const overflow =
        result.violations.length > 10
          ? `\n  ... and ${result.violations.length - 10} more`
          : "";
      throw new Error(
        `Anti-slop violations found:\n${summary}${overflow}\n\n` +
          "These docs are loaded verbatim into LLM prompts. Fix the violations " +
          "before committing. (Em-dash → period/colon. Emoji → remove. " +
          "Buzzword → rephrase.)",
      );
    }
    expect(result.ok).toBe(true);
  });
});
