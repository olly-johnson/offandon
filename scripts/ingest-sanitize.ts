/**
 * scripts/ingest-sanitize.ts
 *
 * BO-042: client ingestion — optional clean-up pass.
 *
 * Reads clients/<slug>/.extracted.json, runs the em-dash sanitizer, and
 * rewrites it in place. Useful when you've already extracted a client
 * and don't want to re-run Sonnet just to strip punctuation.
 *
 * Future extracts get this for free via IngestionExtractor.extract.
 *
 * Usage:
 *   npm run ingest:sanitize -- --client=alex_shaw
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { sanitizeExtractedClientData } from "@/engines/ingestion";
import type { ExtractedClientData } from "@/engines/ingestion/types";

function parseArgs(argv: string[]): { client: string } {
  const args = new Map<string, string | true>();
  for (const part of argv.slice(2)) {
    if (!part.startsWith("--")) continue;
    const [k, v] = part.slice(2).split("=", 2);
    args.set(k, v ?? true);
  }
  const client = args.get("client");
  if (typeof client !== "string" || client.trim() === "") {
    console.error("missing --client=<slug>");
    process.exit(1);
  }
  return { client: client.trim() };
}

function main(): void {
  const { client } = parseArgs(process.argv);

  const extractPath = join(resolve("clients", client), ".extracted.json");
  try {
    statSync(extractPath);
  } catch {
    console.error(`${extractPath} not found`);
    console.error(`run \`npm run ingest:extract -- --client=${client}\` first`);
    process.exit(1);
  }

  let data: ExtractedClientData;
  try {
    data = JSON.parse(readFileSync(extractPath, "utf8")) as ExtractedClientData;
  } catch (err) {
    console.error(`failed to parse ${extractPath}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const before = JSON.stringify(data);
  const cleaned = sanitizeExtractedClientData(data);
  const after = JSON.stringify(cleaned);

  const emDashCount = (before.match(/—/g) ?? []).length;
  const enDashRemoved = (before.match(/[^0-9]–[^0-9]/g) ?? []).length;

  if (before === after) {
    console.log(`no em/en dashes found in ${relative(process.cwd(), extractPath)}`);
    return;
  }

  writeFileSync(extractPath, JSON.stringify(cleaned, null, 2), "utf8");
  console.log(`sanitized ${relative(process.cwd(), extractPath)}`);
  console.log(`  em-dashes removed: ${emDashCount}`);
  console.log(`  en-dashes between words removed: ${enDashRemoved}`);
}

main();
