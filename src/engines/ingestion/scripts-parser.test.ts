import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseFrontmatter, parseScriptsFolder } from "./scripts-parser";

let workspace = "";
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "scripts-parser-"));
});
afterEach(() => {
  if (workspace) rmSync(workspace, { recursive: true, force: true });
});

function write(relPath: string, body: string): void {
  const abs = join(workspace, relPath);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf-8");
}

const FIXTURE = `---
Script: 1
Framework: Hero's Journey
Funnel Stage: top
Hook Type: Client transformation
Word Count: 175
Generated: 2026-02-22 19:52
---

## Source
Some body content here.
`;

describe("parseFrontmatter", () => {
  it("extracts Framework, Funnel Stage, Hook Type, Word Count, Script number", () => {
    const out = parseFrontmatter(FIXTURE);
    expect(out.framework).toBe("Hero's Journey");
    expect(out.funnel_stage).toBe("top");
    expect(out.hook_type).toBe("Client transformation");
    expect(out.word_count).toBe(175);
    expect(out.script_number).toBe(1);
  });

  it("returns empty object when there is no frontmatter block", () => {
    expect(parseFrontmatter("just a body, no frontmatter")).toEqual({});
  });

  it("returns empty object when the frontmatter block has no recognised keys", () => {
    expect(parseFrontmatter("---\nUnknown: x\n---\nbody")).toEqual({});
  });

  it("accepts snake_case key variants (funnel_stage, hook_type, word_count)", () => {
    const out = parseFrontmatter("---\nFramework: Man in a Hole\nfunnel_stage: middle\nhook_type: tip\nword_count: 200\n---\nbody");
    expect(out.framework).toBe("Man in a Hole");
    expect(out.funnel_stage).toBe("middle");
    expect(out.hook_type).toBe("tip");
    expect(out.word_count).toBe(200);
  });

  it("ignores word_count when it isn't a positive integer", () => {
    const out = parseFrontmatter("---\nFramework: X\nWord Count: not a number\n---\nbody");
    expect(out.framework).toBe("X");
    expect(out.word_count).toBeUndefined();
  });

  it("is tolerant of CRLF line endings (Windows)", () => {
    const crlf = FIXTURE.replace(/\n/g, "\r\n");
    const out = parseFrontmatter(crlf);
    expect(out.framework).toBe("Hero's Journey");
  });
});

describe("parseScriptsFolder", () => {
  it("returns [] when there is no scripts/ subdirectory", () => {
    expect(parseScriptsFolder(workspace)).toEqual([]);
  });

  it("returns [] when scripts/ exists but is empty", () => {
    mkdirSync(join(workspace, "scripts"));
    expect(parseScriptsFolder(workspace)).toEqual([]);
  });

  it("emits a past_script asset per .md file with a recognised Framework", () => {
    write("scripts/2026-W08/script_01_top_hero's_journey.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(1);
    const [a] = out;
    expect(a.asset_type).toBe("past_script");
    expect(a.source_file).toBe("scripts/2026-W08/script_01_top_hero's_journey.md");
    expect(a.metadata.framework).toBe("Hero's Journey");
    expect(a.metadata.funnel_stage).toBe("top");
    expect(a.metadata.word_count).toBe(175);
    expect(a.body).toContain("Some body content here.");
  });

  it("derives a human-friendly title from the relative path", () => {
    write("scripts/2026-W08/script_01_top_hero's_journey.md", FIXTURE);
    const [a] = parseScriptsFolder(workspace);
    expect(a.title).toBe("2026 W08 script 01 top hero's journey");
  });

  it("walks nested week subdirectories", () => {
    write("scripts/2026-W08/script_01_top_hero.md", FIXTURE);
    write("scripts/2026-W09/script_02_top_lesson.md", FIXTURE.replace("Hero's Journey", "The Lesson"));
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(2);
    expect(out.map((a) => a.metadata.framework).sort()).toEqual([
      "Hero's Journey",
      "The Lesson",
    ]);
  });

  it("skips files without a Framework header (warns, doesn't throw)", () => {
    write("scripts/odd.md", "no frontmatter at all");
    write("scripts/script_01.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(1);
    expect(out[0].source_file).toBe("scripts/script_01.md");
  });

  it("skips SUMMARY.md and README.md regardless of contents", () => {
    write("scripts/2026-W08/SUMMARY.md", FIXTURE);
    write("scripts/2026-W08/README.md", FIXTURE);
    write("scripts/2026-W08/script_01.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(1);
    expect(out[0].source_file).toBe("scripts/2026-W08/script_01.md");
  });

  it("skips non-.md files in scripts/", () => {
    write("scripts/data.json", "{}");
    write("scripts/notes.txt", "...");
    write("scripts/script_01.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(1);
  });

  it("skips empty files", () => {
    write("scripts/empty.md", "   \n   ");
    write("scripts/real.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out).toHaveLength(1);
    expect(out[0].source_file).toBe("scripts/real.md");
  });

  it("returns deterministic ordering (sorted by source_file)", () => {
    write("scripts/2026-W09/zzz.md", FIXTURE);
    write("scripts/2026-W08/aaa.md", FIXTURE);
    write("scripts/2026-W08/bbb.md", FIXTURE);
    const out = parseScriptsFolder(workspace);
    expect(out.map((a) => a.source_file)).toEqual([
      "scripts/2026-W08/aaa.md",
      "scripts/2026-W08/bbb.md",
      "scripts/2026-W09/zzz.md",
    ]);
  });

  it("preserves apostrophes in titles (e.g. hero's journey)", () => {
    write("scripts/2026-W08/script_01_top_hero's_journey.md", FIXTURE);
    const [a] = parseScriptsFolder(workspace);
    expect(a.title).toContain("hero's journey");
  });
});
