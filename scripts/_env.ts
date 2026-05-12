/**
 * scripts/_env.ts
 *
 * Minimal .env.local loader for the ingestion CLI scripts. Mirrors what
 * Next.js does at dev/build time: parse `KEY=VALUE` lines into
 * `process.env` if the key isn't already set. Comments (#) and blank
 * lines are ignored. Quoted values are unquoted.
 *
 * We intentionally don't pull in `dotenv` — the parse is ~10 lines and
 * the rest of the codebase doesn't depend on it.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LINE_RE = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i;

export function loadEnvLocal(path = ".env.local"): void {
  const abs = resolve(path);
  if (!existsSync(abs)) return;

  const text = readFileSync(abs, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    const value = unquote(rawValue);
    process.env[key] = value;
  }
}

function unquote(s: string): string {
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}
