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
 *
 * `past_scripts` is bumped to 6 to fit one example per common framework
 * (Hero's Journey, Man in a Hole, Lesson, Challenge to Victory, Big Goal
 * / About Me / Myth Buster etc. — see BO-053). Each is rendered with
 * its framework label so the LLM can pick the closest match per script.
 */
export const DEFAULT_ASSET_CAPS: ClientAssetCaps = {
  stories: 12,
  viral_references: 5,
  templates: 5,
  past_scripts: 6,
};

/**
 * Optional framework filter for past_scripts loading. When supplied,
 * only past_scripts whose `metadata.framework` matches (case-insensitive)
 * are returned. Used by SingleScriptGenerator where the framework is
 * fixed by the chosen hook.
 */
export interface LoadAssetsOptions {
  caps?: ClientAssetCaps;
  pastScriptFramework?: string;
}

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
  optsOrCaps: LoadAssetsOptions | ClientAssetCaps = DEFAULT_ASSET_CAPS,
): Promise<ScriptAssetsContext> {
  // Back-compat: callers passing `caps` directly (the old positional
  // signature) keep working. New callers pass `LoadAssetsOptions`.
  const opts: LoadAssetsOptions = isLoadAssetsOptions(optsOrCaps)
    ? optsOrCaps
    : { caps: optsOrCaps };
  const caps = opts.caps ?? DEFAULT_ASSET_CAPS;
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

  const [stories, viral_references, templates, allPastScripts] = await Promise.all([
    fetch("story", caps.stories),
    fetch("viral_reference", caps.viral_references),
    fetch("template", caps.templates),
    // Over-fetch past_scripts so the framework-grouping below has enough
    // rows to dedupe down to `caps.past_scripts` (one per framework).
    fetch("past_script", Math.max(caps.past_scripts * 4, caps.past_scripts)),
  ]);

  const past_scripts = pickPastScriptsByFramework(
    allPastScripts,
    caps.past_scripts,
    opts.pastScriptFramework,
  );

  return { stories, viral_references, templates, past_scripts };
}

function isLoadAssetsOptions(
  v: LoadAssetsOptions | ClientAssetCaps,
): v is LoadAssetsOptions {
  return (
    "caps" in v ||
    "pastScriptFramework" in v ||
    // A bare ClientAssetCaps has the four numeric keys; anything else is
    // treated as LoadAssetsOptions (defensive against future option fields).
    !("stories" in v && "past_scripts" in v)
  );
}

/**
 * Group past_scripts by `metadata.framework` and return one per framework
 * (most-recent within each framework), capped at `limit` rows total.
 *
 * When `frameworkFilter` is supplied, only past_scripts whose framework
 * matches (case-insensitive) are kept, and the framework grouping
 * effectively becomes "the most-recent N within that framework."
 *
 * Past_scripts without a recognised framework fall into a single "_other"
 * bucket and only surface after every named framework has had its turn —
 * this keeps the framework-keyed examples in front when there's a mix of
 * legacy (un-tagged) and BO-053-parsed rows.
 */
export function pickPastScriptsByFramework(
  rows: ClientAssetRow[],
  limit: number,
  frameworkFilter?: string,
): ClientAssetRow[] {
  if (limit <= 0 || rows.length === 0) return [];

  const normalise = (s: unknown): string =>
    typeof s === "string" ? s.trim().toLowerCase() : "";

  const filtered = frameworkFilter
    ? rows.filter((r) => normalise(r.metadata?.framework) === normalise(frameworkFilter))
    : rows;
  if (filtered.length === 0) return [];

  // Caller passed rows in created_at-desc order. We preserve that order
  // within each framework bucket.
  const buckets = new Map<string, ClientAssetRow[]>();
  for (const r of filtered) {
    const fw = normalise(r.metadata?.framework) || "_other";
    if (!buckets.has(fw)) buckets.set(fw, []);
    buckets.get(fw)!.push(r);
  }

  // When filtering to a single framework, return up to `limit` rows from
  // that one bucket (they're already in recency order).
  if (frameworkFilter) {
    const only = buckets.get(normalise(frameworkFilter)) ?? [];
    return only.slice(0, limit);
  }

  // Otherwise round-robin: take one from each bucket in order of first
  // appearance, then a second from each if budget remains, etc. Named
  // frameworks come first; "_other" gets visited last so a creator with
  // no Framework: headers still gets surfaced.
  const orderedKeys = [...buckets.keys()].sort((a, b) => {
    if (a === "_other") return 1;
    if (b === "_other") return -1;
    return 0;
  });

  const out: ClientAssetRow[] = [];
  let round = 0;
  while (out.length < limit) {
    let added = 0;
    for (const k of orderedKeys) {
      if (out.length >= limit) break;
      const bucket = buckets.get(k)!;
      if (round < bucket.length) {
        out.push(bucket[round]);
        added += 1;
      }
    }
    if (added === 0) break;
    round += 1;
  }
  return out;
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
