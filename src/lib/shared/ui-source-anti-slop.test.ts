import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Static gate against em-dashes (and other manifesto violations) in
 * user-facing source files.
 *
 * Background: the methodology forbids em-dashes in any output the user
 * sees. The methodology-docs anti-slop test covers prompt material; this
 * test covers UI source. Together they catch every place a stray em-dash
 * could leak through.
 *
 * Scope: only files under src/app and src/components. Engine code is
 * exempt because its strings either go through the engines (and get
 * anti-slop validated at runtime) or live in tests that intentionally
 * use em-dashes as fixtures. The anti-slop validator itself is exempt
 * because it literally needs the character to match it.
 *
 * If you need an em-dash in a UI file for a documented reason (you do
 * not), add a unique allowlisted exception path here AND explain in a
 * comment.
 */

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "em-dash", re: /—/g },
  { name: "in-summary", re: /\bin summary\b/gi },
  // Note: "ultimately" and "in today's digital landscape" also banned by
  // the manifesto. Add here if they ever appear in UI copy.
];

const TARGET_DIRS = ["src/app", "src/components"];

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

function walk(root: string): string[] {
  const out: string[] = [];
  function recurse(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        recurse(full);
      } else if (
        s.isFile() &&
        (full.endsWith(".ts") || full.endsWith(".tsx")) &&
        !full.endsWith(".test.ts") &&
        !full.endsWith(".test.tsx")
      ) {
        out.push(full);
      }
    }
  }
  recurse(root);
  return out;
}

const REPO_ROOT = findRepoRoot();

function collectViolations(): Array<{
  file: string;
  pattern: string;
  line: number;
  excerpt: string;
}> {
  const violations: Array<{
    file: string;
    pattern: string;
    line: number;
    excerpt: string;
  }> = [];

  for (const dir of TARGET_DIRS) {
    const root = resolve(REPO_ROOT, dir);
    for (const file of walk(root)) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split(/\r?\n/);
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        re.lastIndex = 0;
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            violations.push({
              file: file.replace(REPO_ROOT, "").replace(/^[\\/]+/, ""),
              pattern: name,
              line: i + 1,
              excerpt: lines[i].trim().slice(0, 120),
            });
            re.lastIndex = 0;
          }
        }
      }
    }
  }

  return violations;
}

describe("UI source anti-slop gate", () => {
  it("user-facing source has no em-dashes or forbidden phrases", () => {
    const violations = collectViolations();
    if (violations.length > 0) {
      const summary = violations
        .slice(0, 20)
        .map((v) => `  ${v.file}:${v.line} [${v.pattern}]  ${v.excerpt}`)
        .join("\n");
      const overflow =
        violations.length > 20 ? `\n  ... and ${violations.length - 20} more` : "";
      throw new Error(
        `Forbidden patterns found in UI source:\n${summary}${overflow}\n\n` +
          "These files are user-facing. Em-dashes leak into the UI and " +
          "model the wrong humanisation signal. Use a period, colon, or " +
          "comma. If you genuinely need the character (e.g. in a regex " +
          "fixture), move it into a .test.ts file or src/lib/shared/" +
          "anti-slop.ts (both exempt).",
      );
    }
    expect(violations).toHaveLength(0);
  });
});
