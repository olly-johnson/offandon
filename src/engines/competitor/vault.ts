/**
 * Research Vault: a saved-references surface for competitor reels
 * the user wants to study or recycle into their own scripts. Backs
 * onto the existing client_assets table with asset_type='past_script'
 * (same row shape the script generator already reads), keyed by
 * source_file='competitor:<media_id>' for cheap dedupe + listing.
 *
 * Why we reuse client_assets instead of a new table: the script
 * generator pipeline already pulls past_script rows into its
 * reference array, so a row landing here is immediately available
 * to /scripts without any new wiring.
 */

import { createLogger } from "@/lib/shared/logger";
import type { MediaAnalysis } from "@/engines/research";

import type { CompetitorSupabaseClient } from "./persistence";

const log = createLogger("competitor.vault");

export interface VaultMediaInput {
  id: string;
  permalink: string | null;
  posted_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comments_count: number | null;
}

export interface VaultCompetitorInput {
  id: string;
  username: string;
}

export interface VaultRow {
  user_id: string;
  asset_type: "past_script";
  title: string;
  body: string;
  metadata: VaultRowMetadata;
  source_file: string;
}

export interface VaultRowMetadata {
  source: "competitor";
  competitor_id: string;
  competitor_username: string;
  media_id: string;
  permalink: string | null;
  posted_at: string | null;
  view_count: number | null;
  like_count: number | null;
  comments_count: number | null;
  hook: string | null;
  structure: string | null;
  pillar_match: string | null;
  performance_score: number | null;
}

export interface VaultListRow {
  id: string;
  title: string;
  metadata: VaultRowMetadata;
  created_at: string;
}

/**
 * Vault operations run against client_assets. We reuse the shared
 * CompetitorSupabaseClient (= typed SupabaseClient<Database>) so
 * server actions can pass admin/server clients without separate
 * adapters. Test-only stubs cast through `unknown` to match.
 */
export type VaultClient = CompetitorSupabaseClient;

export interface BuildVaultRowArgs {
  userId: string;
  competitor: VaultCompetitorInput;
  media: VaultMediaInput;
  analysis: MediaAnalysis;
}

/** Pure builder. Keeps the server action thin and the row shape testable. */
export function buildVaultRow(args: BuildVaultRowArgs): VaultRow {
  const { userId, competitor, media, analysis } = args;
  const title = analysis.hook
    ? analysis.hook.slice(0, 80)
    : `@${competitor.username} reference`;

  const bodyLines = [
    analysis.transcript,
    "",
    analysis.what_worked ? `What worked: ${analysis.what_worked}` : null,
    analysis.what_to_repeat ? `Repeat: ${analysis.what_to_repeat}` : null,
  ].filter((s): s is string => !!s);

  return {
    user_id: userId,
    asset_type: "past_script",
    title,
    body: bodyLines.join("\n"),
    metadata: {
      source: "competitor",
      competitor_id: competitor.id,
      competitor_username: competitor.username,
      media_id: media.id,
      permalink: media.permalink,
      posted_at: media.posted_at,
      view_count: media.view_count,
      like_count: media.like_count,
      comments_count: media.comments_count,
      hook: analysis.hook,
      structure: analysis.structure,
      pillar_match: analysis.pillar_match,
      performance_score: analysis.performance_score,
    },
    source_file: `competitor:${media.id}`,
  };
}

export async function saveToVault(
  client: VaultClient,
  args: BuildVaultRowArgs,
): Promise<void> {
  const row = buildVaultRow(args);
  // metadata is typed as Json by the generated Supabase types; cast at
  // the boundary so the upsert payload matches the row schema.
  const { error } = await client
    .from("client_assets")
    .upsert(row as unknown as never, { onConflict: "user_id,source_file" });
  if (error) {
    log.error("vault upsert failed", {
      user_id: args.userId,
      media_id: args.media.id,
      message: error.message,
    });
    throw new Error(`saveToVault: ${error.message}`);
  }
  log.info("competitor reel saved to vault", {
    user_id: args.userId,
    media_id: args.media.id,
    competitor_id: args.competitor.id,
  });
}

export async function removeFromVault(
  client: VaultClient,
  args: { userId: string; mediaId: string },
): Promise<void> {
  const { error } = await client
    .from("client_assets")
    .delete()
    .eq("user_id", args.userId)
    .eq("source_file", `competitor:${args.mediaId}`);
  if (error) {
    log.error("vault delete failed", {
      user_id: args.userId,
      media_id: args.mediaId,
      message: error.message,
    });
    throw new Error(`removeFromVault: ${error.message}`);
  }
}

export async function listResearchVault(
  client: VaultClient,
  userId: string,
  limit = 20,
): Promise<VaultListRow[]> {
  const { data, error } = await client
    .from("client_assets")
    .select("id, title, metadata, created_at")
    .eq("user_id", userId)
    .ilike("source_file", "competitor:%")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    log.error("listResearchVault failed", { user_id: userId, message: error.message });
    throw new Error(`listResearchVault: ${error.message}`);
  }
  // metadata is returned as Json by Supabase types; our writes always
  // shape it as VaultRowMetadata, so the cast is safe at read time.
  return (data ?? []) as unknown as VaultListRow[];
}
