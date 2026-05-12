import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/shared/supabase";

/**
 * Reference material the operator pre-loaded via the ingestion CLI
 * (BO-042). Read at script-generation time to anchor the LLM to the
 * creator's actual stories, viral references, and templates.
 *
 * Caps are deliberate prompt-bloat guardrails. A power user with 50
 * stories doesn't need all 50 in every batch's system prompt; the top
 * slice by recency is enough signal for the model. If a future feature
 * needs targeted retrieval (funnel-matched stories, theme-filtered
 * viral refs), this loader is the place to extend.
 */
export interface ScriptAssetsContext {
  stories: ClientAssetRow[];
  viral_references: ClientAssetRow[];
  templates: ClientAssetRow[];
  past_scripts: ClientAssetRow[];
}

export interface ClientAssetRow {
  asset_type: "story" | "viral_reference" | "past_script" | "template";
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

export interface ClientAssetCaps {
  stories: number;
  viral_references: number;
  templates: number;
  past_scripts: number;
}

/**
 * Defaults sized to keep the rendered block around 6-10K chars even on
 * a fully-stocked creator. Adjust here, not at call sites.
 */
export const DEFAULT_ASSET_CAPS: ClientAssetCaps = {
  stories: 12,
  viral_references: 5,
  templates: 5,
  past_scripts: 3,
};

type Client = SupabaseClient<Database>;

/**
 * Load the per-creator asset context for script generation. Returns
 * empty arrays for any asset_type with no rows so the caller doesn't
 * have to null-check.
 *
 * Pulls each asset_type with its own query rather than one combined
 * fetch + in-memory partition. Per-type ORDER BY + LIMIT lets Postgres
 * use the (user_id, asset_type, created_at desc) index cleanly and
 * avoids the case where one asset_type's volume crowds another out.
 */
export async function loadScriptAssetsContext(
  supabase: Client,
  userId: string,
  caps: ClientAssetCaps = DEFAULT_ASSET_CAPS,
): Promise<ScriptAssetsContext> {
  const fetch = async (
    assetType: ClientAssetRow["asset_type"],
    limit: number,
  ): Promise<ClientAssetRow[]> => {
    if (limit <= 0) return [];
    const { data, error } = await supabase
      .from("client_assets")
      .select("asset_type, title, body, metadata")
      .eq("user_id", userId)
      .eq("asset_type", assetType)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      throw new Error(`loadScriptAssetsContext(${assetType}): ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      asset_type: row.asset_type as ClientAssetRow["asset_type"],
      title: row.title,
      body: row.body,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
    }));
  };

  const [stories, viral_references, templates, past_scripts] = await Promise.all([
    fetch("story", caps.stories),
    fetch("viral_reference", caps.viral_references),
    fetch("template", caps.templates),
    fetch("past_script", caps.past_scripts),
  ]);

  return { stories, viral_references, templates, past_scripts };
}

/**
 * Convenience: true when the context has at least one row across any
 * asset_type. The system-prompt builder skips the whole block when this
 * is false so non-ingested users don't carry empty-section noise.
 */
export function hasAnyAssets(ctx: ScriptAssetsContext | null | undefined): boolean {
  if (!ctx) return false;
  return (
    ctx.stories.length > 0 ||
    ctx.viral_references.length > 0 ||
    ctx.templates.length > 0 ||
    ctx.past_scripts.length > 0
  );
}
