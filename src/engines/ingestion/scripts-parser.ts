/**
 * Deterministic parser for `clients/<slug>/scripts/` markdown files (BO-053).
 *
 * Past scripts in the operator's folder structure carry a YAML-style
 * frontmatter block with a `Framework:` line ("Hero's Journey", "Man in
 * a Hole", "The Lesson", etc.). The LLM extraction path (BO-042) skips
 * the `scripts/` directory, so until now these never made it into
 * `client_assets` as past_script rows.
 *
 * This module parses every `.md` file under `scripts/` deterministically,
 * pulls the framework + a few useful fields out of the frontmatter, and
 * emits `ExtractedClientAsset` rows ready to be appended to the
 * ingestion pipeline's `.extracted.json`. No LLM call needed: the
 * structure is consistent enough to regex.
 *
 * Why deterministic instead of LLM?
 *   - Frontmatter is structured. We don't need probabilistic extraction.
 *   - Cheaper and faster than a Claude call per script.
 *   - More reliable: an LLM occasionally drops the framework or
 *     mis-classifies it; a regex either matches or it doesn't.
 *
 * The framework string is stored verbatim in `metadata.framework` so the
 * downstream system prompt can label each past_script with its framework
 * and the model can pick the matching example as a structural anchor.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { createLogger } from "@/lib/shared/logger";

import type { ExtractedClientAsset } from "./types";

const log = createLogger("ingestion.scripts-parser");

const SCRIPTS_SUBDIR = "scripts";

/** Files inside scripts/ that aren't actual scripts and should be ignored. */
const SKIP_FILENAMES: ReadonlySet<string> = new Set([
  "summary.md",
  "readme.md",
]);

interface ParsedFrontmatter {
  framework?: string;
  funnel_stage?: string;
  hook_type?: string;
  word_count?: number;
  script_number?: number;
}

/**
 * Walk every `.md` file under `clientDir/scripts/` recursively. Returns a
 * past_script ExtractedClientAsset per file whose frontmatter contains a
 * Framework: header. Files without a recognisable Framework are skipped
 * with a warn log — they're either malformed exports or summaries.
 *
 * The returned array is sorted by relative path so re-runs are
 * deterministic (matters because downstream upsert keys off
 * `source_file`).
 */
export function parseScriptsFolder(clientDir: string): ExtractedClientAsset[] {
  const scriptsDir = join(clientDir, SCRIPTS_SUBDIR);
  if (!existsSync(scriptsDir)) return [];

  const files: Array<{ absolutePath: string; relativePath: string }> = [];
  walk(scriptsDir, scriptsDir, files);

  const out: ExtractedClientAsset[] = [];
  for (const f of files) {
    let body: string;
    try {
      body = readFileSync(f.absolutePath, "utf-8");
    } catch (err) {
      log.warn("could not read script", {
        path: f.relativePath,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (body.trim().length === 0) {
      log.warn("empty script file skipped", { path: f.relativePath });
      continue;
    }

    const frontmatter = parseFrontmatter(body);
    if (!frontmatter.framework) {
      log.warn("script has no Framework: header, skipping", {
        path: f.relativePath,
      });
      continue;
    }

    const metadata: Record<string, unknown> = {
      framework: frontmatter.framework,
    };
    if (frontmatter.funnel_stage) {
      metadata.funnel_stage = frontmatter.funnel_stage;
      metadata.format = frontmatter.funnel_stage; // mirror existing past_script convention
    }
    if (frontmatter.hook_type) {
      metadata.hook_type = frontmatter.hook_type;
    }
    if (frontmatter.word_count !== undefined) {
      metadata.word_count = frontmatter.word_count;
    }
    if (frontmatter.script_number !== undefined) {
      metadata.script_number = frontmatter.script_number;
    }

    out.push({
      asset_type: "past_script",
      title: humaniseRelativePath(f.relativePath),
      body: body.trim(),
      metadata,
      source_file: `${SCRIPTS_SUBDIR}/${f.relativePath}`,
    });
  }

  out.sort((a, b) => (a.source_file ?? "").localeCompare(b.source_file ?? ""));
  return out;
}

function walk(
  root: string,
  dir: string,
  acc: Array<{ absolutePath: string; relativePath: string }>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = join(dir, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(root, abs, acc);
      continue;
    }
    if (!stat.isFile()) continue;
    if (extname(entry).toLowerCase() !== ".md") continue;
    if (SKIP_FILENAMES.has(entry.toLowerCase())) continue;

    const rel = abs
      .slice(root.length)
      .replace(/^[\\/]+/, "")
      .replace(/\\/g, "/");
    acc.push({ absolutePath: abs, relativePath: rel });
  }
}

/**
 * Parse the leading `---\n...\n---\n` frontmatter block. Recognises the
 * keys our operators have actually used:
 *   Script: 1
 *   Framework: Hero's Journey
 *   Funnel Stage: top
 *   Hook Type: ...
 *   Word Count: 175
 *
 * Returns an empty object when no frontmatter is present (the caller
 * decides whether that's fatal).
 */
export function parseFrontmatter(body: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) return result;

  const block = match[1];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (value.length === 0) continue;

    switch (key) {
      case "framework":
        result.framework = value;
        break;
      case "funnel stage":
      case "funnel_stage":
        result.funnel_stage = value;
        break;
      case "hook type":
      case "hook_type":
        result.hook_type = value;
        break;
      case "word count":
      case "word_count": {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) result.word_count = n;
        break;
      }
      case "script": {
        const n = parseInt(value, 10);
        if (Number.isFinite(n) && n > 0) result.script_number = n;
        break;
      }
    }
  }
  return result;
}

function humaniseRelativePath(rel: string): string {
  const sansExt = rel.replace(/\.md$/i, "");
  const cleaned = sansExt.replace(/[\\/_]+/g, " ").replace(/-+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : rel;
}
