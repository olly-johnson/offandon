/**
 * scripts/ingest-extract.ts
 *
 * BO-042: client ingestion — step 1.
 *
 * Reads all relevant files under `clients/<slug>/`, sends them through a
 * single Claude pass, writes the structured extract to
 * `clients/<slug>/.extracted.json`. No DB writes.
 *
 * Usage:
 *   npm run ingest:extract -- --client=alex_shaw
 *   npm run ingest:extract -- --client=alex_shaw --include-transcripts
 *
 * By default transcripts/ is skipped because it bulks up the prompt for
 * little voice-extraction marginal value (the model already has the
 * verbatim quotes in voice_profile.md "Raw Voice Samples"). Pass
 * --include-transcripts to feed the transcripts/ folder in too.
 *
 * Requires ANTHROPIC_API_KEY in the environment (the script loads
 * .env.local automatically).
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { IngestionExtractor } from "@/engines/ingestion";
import { parseScriptsFolder } from "@/engines/ingestion/scripts-parser";
import {
  INGESTION_MAX_TOKENS,
  INGESTION_MODEL,
} from "@/engines/ingestion/system-prompt";
import type { ClientSourceFile } from "@/engines/ingestion/types";
import { createLogger } from "@/lib/shared/logger";

import { loadEnvLocal } from "./_env";

const log = createLogger("ingest.extract");

const ALWAYS_SKIP_DIRS = new Set([
  "performance",
  "youtube",
  "scripts",
  // Generated output, dashboards, metrics — out of scope per BO-042 audit.
]);

const ALWAYS_SKIP_FILES = new Set([
  "business_dashboard.html",
  "classified_posts.json",
  "metrics_history.json",
  "content_pipeline.json",
  "dashboard.json",
  "dashboard_insights.json",
  ".extracted.json",
]);

const KEEP_EXTENSIONS = new Set([".md", ".json", ".txt"]);

function parseArgs(argv: string[]): {
  client: string;
  includeTranscripts: boolean;
  includeViralRefs: boolean;
} {
  const args = new Map<string, string | true>();
  for (const part of argv.slice(2)) {
    if (!part.startsWith("--")) continue;
    const [k, v] = part.slice(2).split("=", 2);
    args.set(k, v ?? true);
  }
  const client = args.get("client");
  if (typeof client !== "string" || client.trim() === "") {
    console.error("missing --client=<slug>");
    console.error("usage: npm run ingest:extract -- --client=<slug> [--include-transcripts] [--no-viral-refs]");
    process.exit(1);
  }
  return {
    client: client.trim(),
    includeTranscripts: args.get("include-transcripts") === true,
    includeViralRefs: args.get("no-viral-refs") !== true,
  };
}

function walk(dir: string, baseDir: string, opts: {
  includeTranscripts: boolean;
  includeViralRefs: boolean;
}): ClientSourceFile[] {
  const out: ClientSourceFile[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(baseDir, full).replaceAll("\\", "/");
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry)) continue;
      if (entry === "transcripts" && !opts.includeTranscripts) continue;
      if (entry === "viral_references" && !opts.includeViralRefs) continue;
      out.push(...walk(full, baseDir, opts));
      continue;
    }

    if (ALWAYS_SKIP_FILES.has(entry)) continue;
    const ext = entry.slice(entry.lastIndexOf(".")).toLowerCase();
    if (!KEEP_EXTENSIONS.has(ext)) continue;

    try {
      const body = readFileSync(full, "utf8");
      out.push({ relativePath: rel, body });
    } catch (err) {
      log.warn("skip unreadable file", { rel, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { client, includeTranscripts, includeViralRefs } = parseArgs(process.argv);

  const clientDir = resolve("clients", client);
  let stat;
  try {
    stat = statSync(clientDir);
  } catch {
    console.error(`clients/${client} not found`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`clients/${client} is not a directory`);
    process.exit(1);
  }

  const files = walk(clientDir, clientDir, { includeTranscripts, includeViralRefs });
  if (files.length === 0) {
    console.error(`no source files found under clients/${client}`);
    process.exit(1);
  }

  const totalChars = files.reduce((n, f) => n + f.body.length, 0);
  console.log(`reading ${files.length} files (${totalChars.toLocaleString()} chars) for client "${client}"`);
  console.log(`  model: ${INGESTION_MODEL}, max_tokens: ${INGESTION_MAX_TOKENS}`);
  if (!includeTranscripts) console.log(`  transcripts/ skipped (pass --include-transcripts to add)`);
  if (!includeViralRefs) console.log(`  viral_references/ skipped (you passed --no-viral-refs)`);

  const llm = new AnthropicLLMClient({
    model: INGESTION_MODEL,
    maxTokens: INGESTION_MAX_TOKENS,
  });
  const engine = new IngestionExtractor({ llm });

  console.log(`calling claude...`);
  const startedAt = Date.now();
  let data;
  try {
    data = await engine.extract({
      clientSlug: client,
      files,
      nowIso: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`extract failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`extraction done in ${duration}s`);

  // Deterministic past_script pass (BO-053). Scripts under
  // clients/<slug>/scripts/ carry a `Framework:` frontmatter header that
  // the LLM doesn't need to interpret. Parse them in code and merge into
  // client_assets so the loader can serve framework-keyed examples to
  // the script generator. Idempotent re-runs upsert on the composed
  // `source_file` key.
  const parsedScripts = parseScriptsFolder(clientDir);
  if (parsedScripts.length > 0) {
    data = { ...data, client_assets: [...data.client_assets, ...parsedScripts] };
    console.log(`  +${parsedScripts.length} past_scripts parsed from scripts/`);
  }

  console.log(`  voice_dna.content_pillars: ${data.voice_dna.content_pillars.length}`);
  console.log(`  client_assets: ${data.client_assets.length}`);
  console.log(`  user_memories: ${data.user_memories.length}`);
  console.log(`  user_methodology: ${data.user_methodology.length} chars`);

  const outPath = join(clientDir, ".extracted.json");
  writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`wrote ${relative(process.cwd(), outPath)}`);
  console.log(``);
  console.log(`next: review the file, then`);
  console.log(`  npm run ingest:commit -- --client=${client} --user-id=<uuid>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
