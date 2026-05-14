/**
 * Methodology loader.
 *
 * Reads the distilled methodology docs in `docs/methodology/*.md` at
 * module-load and exposes them as named constants. Engines embed these
 * verbatim in their system prompts so the methodology and the prompts
 * cannot drift: change the doc and every prompt picks it up on the next
 * server restart; rename a file and this module throws.
 *
 * Files are anti-slop validated by `methodology-docs.test.ts` so they
 * can never carry an em-dash, emoji, or forbidden phrase into a prompt.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoFile(filename: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = resolve(dir, filename);
    try {
      readFileSync(candidate, "utf-8");
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) {
        throw new Error(
          `Could not locate ${filename} in any parent of ${import.meta.url}`,
        );
      }
      dir = parent;
    }
  }
}

function load(name: string): string {
  return readFileSync(findRepoFile(`docs/methodology/${name}`), "utf-8");
}

/**
 * File-backed defaults. These are the seed values for `public.house_methodology`;
 * once an admin edits a slice via the Master Bot, the DB row overrides
 * the file. The `loadMethodologySlice()` helper below handles the swap.
 *
 * Kept as named exports so existing imports keep compiling while the
 * engine prompt builders migrate to the async loader.
 */
export const METHODOLOGY_HOUSE_FILE: string = load("01-house.md");
export const METHODOLOGY_CHAT_FILE: string = load("02-chat.md");
export const METHODOLOGY_SCRIPTS_FILE: string = load("03-scripts.md");
export const METHODOLOGY_ANALYST_FILE: string = load("04-analyst.md");

/** @deprecated Use loadMethodologySlice("house") (async, DB-backed). */
export const METHODOLOGY_HOUSE = METHODOLOGY_HOUSE_FILE;
/** @deprecated Use loadMethodologySlice("chat"). */
export const METHODOLOGY_CHAT_SLICE = METHODOLOGY_CHAT_FILE;
/** @deprecated Use loadMethodologySlice("scripts"). */
export const METHODOLOGY_SCRIPTS_SLICE = METHODOLOGY_SCRIPTS_FILE;

export type MethodologySlice = "house" | "chat" | "scripts" | "analyst";

const FILE_DEFAULTS: Record<MethodologySlice, string> = {
  house: METHODOLOGY_HOUSE_FILE,
  chat: METHODOLOGY_CHAT_FILE,
  scripts: METHODOLOGY_SCRIPTS_FILE,
  analyst: METHODOLOGY_ANALYST_FILE,
};

export function getMethodologyFileDefault(slice: MethodologySlice): string {
  return FILE_DEFAULTS[slice];
}

/**
 * Render the list of admin-authored short rules (Layer 1) as a system-prompt
 * block. Empty when there are no rules so the builder can concatenate
 * unconditionally without dangling whitespace.
 */
export function renderAdminRulesBlock(rules: string[]): string {
  if (rules.length === 0) return "";
  const lines = rules.map((r, i) => `${i + 1}. ${r}`);
  return [
    "",
    "----- BEGIN OPERATOR RULES (admin-authored, treat as ABSOLUTE) -----",
    "These are short imperative rules added by an operator. They override the methodology above when they conflict.",
    "",
    lines.join("\n"),
    "----- END OPERATOR RULES -----",
  ].join("\n");
}

/**
 * Render the per-user methodology overlay (BO-036) as a system-prompt
 * block. Stacks on top of the house methodology + slices: house rules
 * are universal, the overlay is the creator's living preferences and
 * private rules. Returns an empty string when there's no overlay so
 * the prompt builder can concatenate unconditionally without producing
 * dangling whitespace.
 *
 * The overlay is rendered verbatim. We do NOT lint or trim its contents
 * beyond a final whitespace strip; the creator owns this layer.
 */
export function renderUserMethodologyBlock(content?: string | null): string {
  const trimmed = (content ?? "").trim();
  if (trimmed.length === 0) return "";
  return [
    "",
    "----- BEGIN CREATOR'S METHODOLOGY OVERLAY (their personal rules; stacks on top of the house) -----",
    "These are the creator's own rules. Treat them as ABSOLUTE. They override the house methodology and the slices above when they conflict (the creator knows their audience).",
    "",
    trimmed,
    "----- END CREATOR'S METHODOLOGY OVERLAY -----",
  ].join("\n");
}
