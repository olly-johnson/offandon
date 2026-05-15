/**
 * scripts/ingest-corpus.ts
 *
 * BO-052: incremental ingestion of long-form client artifacts (Fathom
 * transcripts, weekly questionnaires, notes, long-form essays) into the
 * client_documents / client_document_chunks tables.
 *
 * Distinct from `ingest:extract` + `ingest:commit` (BO-042) which is a
 * one-shot LLM-driven extraction into the Tier-1 tables (voice_dna,
 * client_assets, user_memories, user_methodology). This script is the
 * Tier-2 path: no LLM extraction, just chunk + embed + write. Run it
 * weekly as new transcripts and questionnaire responses accumulate; the
 * sidecar watermark (`clients/<slug>/.corpus-ingested.json`) means only
 * new or modified files are re-processed.
 *
 * Usage:
 *   npm run ingest:corpus -- --client=alex_shaw --user-id=<uuid>
 *   npm run ingest:corpus -- --client=alex_shaw --user-id=<uuid> --rebuild
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * VOYAGE_API_KEY in the environment.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ingestCorpus } from "@/engines/ingestion";
import { VoyageEmbeddingsClient } from "@/lib/shared/embeddings";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

function parseArgs(argv: string[]): {
  client: string;
  userId: string;
  rebuild: boolean;
} {
  const args = new Map<string, string | true>();
  for (const part of argv.slice(2)) {
    if (!part.startsWith("--")) continue;
    const [k, v] = part.slice(2).split("=", 2);
    args.set(k, v ?? true);
  }
  const client = args.get("client");
  const userId = args.get("user-id");
  if (typeof client !== "string" || client.trim() === "") {
    console.error("missing --client=<slug>");
    process.exit(1);
  }
  if (typeof userId !== "string" || userId.trim() === "") {
    console.error("missing --user-id=<uuid>");
    process.exit(1);
  }
  return {
    client: client.trim(),
    userId: userId.trim(),
    rebuild: args.get("rebuild") === true,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { client, userId, rebuild } = parseArgs(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!url || !serviceKey) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!voyageKey) {
    console.error("missing VOYAGE_API_KEY");
    console.error("get one from dash.voyageai.com and put it in .env.local");
    process.exit(1);
  }

  const clientDir = resolve("clients", client);
  if (!existsSync(clientDir) || !statSync(clientDir).isDirectory()) {
    console.error(`clients/${client}/ not found`);
    process.exit(1);
  }

  console.log(`ingesting corpus for client="${client}" user_id=${userId} rebuild=${rebuild}`);

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });

  const result = await ingestCorpus(
    { supabase, embeddings },
    {
      userId,
      clientDir,
      rebuild,
      onLog: (line) => console.log(line),
    },
  );

  console.log(``);
  console.log(`processed: ${result.processed}`);
  console.log(`skipped:   ${result.skipped}`);
  console.log(`failed:    ${result.failed.length}`);
  for (const f of result.failed) {
    console.log(`  ${f.relativePath}: ${f.error}`);
  }

  if (result.failed.length > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
