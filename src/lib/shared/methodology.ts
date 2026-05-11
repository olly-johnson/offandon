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

export const METHODOLOGY_HOUSE: string = load("01-house.md");
export const METHODOLOGY_CHAT_SLICE: string = load("02-chat.md");
export const METHODOLOGY_SCRIPTS_SLICE: string = load("03-scripts.md");

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
