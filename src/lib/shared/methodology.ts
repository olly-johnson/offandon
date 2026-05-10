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
