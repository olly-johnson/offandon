import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database, Json } from "@/lib/shared/supabase";

import type { ExtractedClientAsset, ExtractedClientData, ExtractedMemory } from "./types";

const log = createLogger("ingestion.persistence");

/**
 * Convenience alias. The committer expects a service-role client because
 * it writes across many tables (profiles, voice_dna, client_assets,
 * user_memories, user_methodology) with no end-user JWT in scope. Calling
 * with an anon client will fail the RLS checks on every table.
 */
export type IngestionSupabaseClient = SupabaseClient<Database>;

export interface IngestionCommitInput {
  supabase: IngestionSupabaseClient;
  userId: string;
  data: ExtractedClientData;
  /** Optional callback for per-step progress lines from the CLI. */
  onLog?: (line: string) => void;
}

/**
 * Write a reviewed `.extracted.json` to the database for a specific user.
 *
 * Ordering is chosen so a failure leaves the DB in a recoverable state.
 * Voice DNA goes first (it's the source-of-truth artifact); if it fails
 * everything else is skipped. Client assets / memories / methodology are
 * subsequently independent — a partial commit is a valid mid-state the
 * operator can re-run from.
 *
 * Non-atomic by design. Cross-table transactions would need a stored
 * procedure; for an operator-triggered one-shot the cost-benefit isn't
 * worth it. Re-running `ingest:commit` is idempotent for everything
 * except user_memories (which dupes on re-run — operator deletes by
 * hand if needed).
 */
export async function commitClientIngestion(input: IngestionCommitInput): Promise<void> {
  const { supabase, userId, data, onLog } = input;
  const emit = (line: string) => {
    log.info(line, { user_id: userId });
    onLog?.(line);
  };

  await upsertProfile(supabase, userId, data);
  emit(`profile upserted (display_name="${data.profile.display_name}")`);

  await supersedeAndInsertVoiceDna(supabase, userId, data);
  emit(`voice_dna superseded + inserted`);

  if (data.client_assets.length > 0) {
    await upsertClientAssets(supabase, userId, data.client_assets);
    emit(`client_assets upserted (${data.client_assets.length} rows)`);
  }

  if (data.user_memories.length > 0) {
    await insertUserMemories(supabase, userId, data.user_memories);
    emit(`user_memories inserted (${data.user_memories.length} rows)`);
  }

  if (data.user_methodology.trim() !== "") {
    await upsertUserMethodology(supabase, userId, data.user_methodology);
    emit(`user_methodology upserted (${data.user_methodology.length} chars)`);
  }
}

async function upsertProfile(
  supabase: IngestionSupabaseClient,
  userId: string,
  data: ExtractedClientData,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      display_name: data.profile.display_name,
      handle: data.profile.handle ?? null,
    });
  if (error) {
    throw new Error(`ingestion: profiles upsert failed: ${error.message}`);
  }
}

async function supersedeAndInsertVoiceDna(
  supabase: IngestionSupabaseClient,
  userId: string,
  data: ExtractedClientData,
): Promise<void> {
  // Recompute the hash from source_answers instead of trusting the LLM.
  // The hash is used downstream as a reproducibility hook; the operator
  // shouldn't have to hand-edit a 64-char string to keep it consistent.
  const hash = sha256(JSON.stringify(data.source_answers));
  const dna = { ...data.voice_dna, source_questionnaire_hash: hash };

  const supersededAt = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("voice_dna")
    .update({ superseded_at: supersededAt })
    .eq("user_id", userId)
    .is("superseded_at", null);
  if (updateErr) {
    throw new Error(`ingestion: voice_dna supersede failed: ${updateErr.message}`);
  }

  const { error: insertErr } = await supabase
    .from("voice_dna")
    .insert({
      user_id: userId,
      dna: dna as unknown as Json,
      source_answers: data.source_answers as unknown as Json,
      source_questionnaire_hash: hash,
    });
  if (insertErr) {
    throw new Error(`ingestion: voice_dna insert failed: ${insertErr.message}`);
  }
}

type ClientAssetInsertRow = Database["public"]["Tables"]["client_assets"]["Insert"];

async function upsertClientAssets(
  supabase: IngestionSupabaseClient,
  userId: string,
  assets: ExtractedClientAsset[],
): Promise<void> {
  // Derive a deterministic source_file from the LLM-emitted path + title
  // slug. Without this step, multiple assets from the same file (e.g.
  // every story in story_bank.md) collide on (user_id, source_file)
  // inside a single upsert batch and Postgres rejects with "ON CONFLICT
  // DO UPDATE command cannot affect row a second time".
  //
  // The composed key is stable across re-ingests (same title -> same
  // slug), so idempotency holds.
  const rowsWithSource: ClientAssetInsertRow[] = [];
  const rowsWithoutSource: ClientAssetInsertRow[] = [];
  for (const a of assets) {
    const sourceKey = composeSourceKey(a);
    const base: Omit<ClientAssetInsertRow, "source_file"> = {
      user_id: userId,
      asset_type: a.asset_type,
      title: a.title,
      body: a.body,
      metadata: a.metadata as Json,
    };
    if (sourceKey) {
      rowsWithSource.push({ ...base, source_file: sourceKey });
    } else {
      rowsWithoutSource.push({ ...base, source_file: null });
    }
  }

  // Defence in depth: if the LLM produced two assets with the same title
  // AND the same source path, the composed key still collides. Drop
  // duplicates within the batch (keep first) before the DB sees them.
  const seen = new Set<string>();
  const deduped: ClientAssetInsertRow[] = rowsWithSource.filter((row) => {
    const key = row.source_file as string;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length > 0) {
    const { error } = await supabase
      .from("client_assets")
      .upsert(deduped, { onConflict: "user_id,source_file" });
    if (error) {
      throw new Error(`ingestion: client_assets upsert failed: ${error.message}`);
    }
  }

  if (rowsWithoutSource.length > 0) {
    const { error } = await supabase.from("client_assets").insert(rowsWithoutSource);
    if (error) {
      throw new Error(`ingestion: client_assets insert (no-source) failed: ${error.message}`);
    }
  }
}

/**
 * Compose a stable `(user_id, source_file)` key from the LLM-emitted
 * source_file + the asset's title. Strips any anchor the model already
 * added so the slug source-of-truth is the title, not the prompt.
 *
 * Returns null when the asset has no source_file at all (those go to a
 * plain insert path and accept duplicates on re-run).
 */
function composeSourceKey(asset: ExtractedClientAsset): string | null {
  if (!asset.source_file) return null;
  const basePath = asset.source_file.split("#")[0].trim();
  if (basePath === "") return null;
  const slug = slugify(asset.title);
  return slug === "" ? basePath : `${basePath}#${slug}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function insertUserMemories(
  supabase: IngestionSupabaseClient,
  userId: string,
  memories: ExtractedMemory[],
): Promise<void> {
  const rows = memories.map((m) => ({
    user_id: userId,
    fact: m.fact,
    category: m.category,
    priority: m.priority ?? 3,
  }));
  const { error } = await supabase.from("user_memories").insert(rows);
  if (error) {
    throw new Error(`ingestion: user_memories insert failed: ${error.message}`);
  }
}

async function upsertUserMethodology(
  supabase: IngestionSupabaseClient,
  userId: string,
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_methodology")
    .upsert({ user_id: userId, content });
  if (error) {
    throw new Error(`ingestion: user_methodology upsert failed: ${error.message}`);
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
