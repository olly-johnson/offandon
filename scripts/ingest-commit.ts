/**
 * scripts/ingest-commit.ts
 *
 * BO-042: client ingestion — step 2.
 *
 * Reads `clients/<slug>/.extracted.json` (produced by ingest-extract) and
 * writes it to the database for the specified user. Idempotent on
 * client_assets keyed on (user_id, source_file); voice_dna append-only
 * via supersede; user_memories duplicates on re-run (delete by hand if
 * needed); user_methodology last-write-wins.
 *
 * The user_id must already exist in auth.users. Create it first via the
 * admin invite endpoint (/admin/invite) or directly in the Supabase
 * dashboard.
 *
 * Usage:
 *   npm run ingest:commit -- --client=alex_shaw --user-id=<uuid>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */

import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { commitClientIngestion } from "@/engines/ingestion";
import type { ExtractedClientData } from "@/engines/ingestion/types";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

function parseArgs(argv: string[]): { client: string; userId: string } {
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
  return { client: client.trim(), userId: userId.trim() };
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { client, userId } = parseArgs(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("set them in .env.local before running this script");
    process.exit(1);
  }

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

  console.log(`committing extracted data for client="${client}" user_id=${userId}`);
  console.log(`  voice_dna.content_pillars: ${data.voice_dna.content_pillars.length}`);
  console.log(`  client_assets: ${data.client_assets.length}`);
  console.log(`  user_memories: ${data.user_memories.length}`);
  console.log(`  user_methodology: ${data.user_methodology.length} chars`);
  console.log(``);

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await commitClientIngestion({
      supabase,
      userId,
      data,
      onLog: (line) => console.log(`  ✓ ${line}`),
    });
  } catch (err) {
    console.error(`commit failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log(``);
  console.log(`done. sign in as the user to verify (voice_dna existence skips onboarding).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
