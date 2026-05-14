/**
 * Persistence layer for the Master Bot.
 *
 * Three concerns:
 *   - methodology_rules: Layer 1 one-liners (CRUD + soft delete).
 *   - house_methodology: Layer 2 slice content. DB takes precedence over
 *     the file under docs/methodology/. Every save snapshots the prior
 *     row into house_methodology_versions.
 *   - master_bot_messages: shared admin chat thread.
 *
 * All queries assume a service-role Supabase client. RLS is deny-by-
 * default on these tables; admin gating happens at the action layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import {
  getMethodologyFileDefault,
  type MethodologySlice,
} from "@/lib/shared/methodology";
import type { Database } from "@/lib/shared/supabase/types";

const log = createLogger("master-bot.persistence");

export type MasterBotSupabaseClient = SupabaseClient<Database>;

export interface MethodologyRule {
  id: string;
  slice: MethodologySlice;
  rule: string;
  created_at: string;
  updated_at: string;
}

export interface HouseVersion {
  id: string;
  slice: MethodologySlice;
  content: string;
  summary: string;
  created_by: string | null;
  created_at: string;
}

export interface MasterBotMessage {
  id: string;
  author_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

/* ---------------------------------------------------------------------------
 * Rules (Layer 1)
 * ------------------------------------------------------------------------- */

export async function listActiveRules(
  supabase: MasterBotSupabaseClient,
  opts: { slice?: MethodologySlice } = {},
): Promise<MethodologyRule[]> {
  let q = supabase
    .from("methodology_rules")
    .select("id, slice, rule, created_at, updated_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (opts.slice) q = q.eq("slice", opts.slice);
  const { data, error } = await q;
  if (error) throw new Error(`listActiveRules: ${error.message}`);
  return (data ?? []) as MethodologyRule[];
}

/**
 * Group the rules that apply to a given slice. House rules ALWAYS apply
 * (universal); slice-specific rules apply only to that slice. The Master
 * Bot picks the slice; the prompt builder takes both layers in order.
 */
export async function listRulesForSlicePrompt(
  supabase: MasterBotSupabaseClient,
  slice: Exclude<MethodologySlice, "house">,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("methodology_rules")
    .select("rule, slice")
    .is("deleted_at", null)
    .in("slice", ["house", slice])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listRulesForSlicePrompt: ${error.message}`);
  return (data ?? []).map((r) => r.rule);
}

export async function addRule(
  supabase: MasterBotSupabaseClient,
  args: { slice: MethodologySlice; rule: string; createdBy: string | null },
): Promise<MethodologyRule> {
  const trimmed = args.rule.trim();
  if (trimmed.length === 0) throw new Error("addRule: rule is empty");
  const { data, error } = await supabase
    .from("methodology_rules")
    .insert({ slice: args.slice, rule: trimmed, created_by: args.createdBy })
    .select("id, slice, rule, created_at, updated_at")
    .single();
  if (error) throw new Error(`addRule: ${error.message}`);
  log.info("rule added", { slice: args.slice, id: data?.id });
  return data as MethodologyRule;
}

export async function updateRule(
  supabase: MasterBotSupabaseClient,
  args: { id: string; rule: string },
): Promise<MethodologyRule> {
  const trimmed = args.rule.trim();
  if (trimmed.length === 0) throw new Error("updateRule: rule is empty");
  const { data, error } = await supabase
    .from("methodology_rules")
    .update({ rule: trimmed, updated_at: new Date().toISOString() })
    .eq("id", args.id)
    .is("deleted_at", null)
    .select("id, slice, rule, created_at, updated_at")
    .single();
  if (error) throw new Error(`updateRule: ${error.message}`);
  log.info("rule updated", { id: args.id });
  return data as MethodologyRule;
}

export async function deleteRule(
  supabase: MasterBotSupabaseClient,
  args: { id: string },
): Promise<void> {
  const { error } = await supabase
    .from("methodology_rules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", args.id)
    .is("deleted_at", null);
  if (error) throw new Error(`deleteRule: ${error.message}`);
  log.info("rule deleted", { id: args.id });
}

/* ---------------------------------------------------------------------------
 * House methodology (Layer 2)
 * ------------------------------------------------------------------------- */

/**
 * Return the active content for a slice. DB wins if a row exists,
 * otherwise the file default. This is what every engine prompt builder
 * should call.
 */
export async function loadMethodologySlice(
  supabase: MasterBotSupabaseClient,
  slice: MethodologySlice,
): Promise<string> {
  const { data, error } = await supabase
    .from("house_methodology")
    .select("content")
    .eq("slice", slice)
    .maybeSingle();
  if (error) {
    log.warn("loadMethodologySlice DB read failed; falling back to file", {
      slice,
      message: error.message,
    });
    return getMethodologyFileDefault(slice);
  }
  return data?.content ?? getMethodologyFileDefault(slice);
}

export async function loadAllMethodologySlices(
  supabase: MasterBotSupabaseClient,
): Promise<Record<MethodologySlice, string>> {
  const [house, chat, scripts, analyst] = await Promise.all([
    loadMethodologySlice(supabase, "house"),
    loadMethodologySlice(supabase, "chat"),
    loadMethodologySlice(supabase, "scripts"),
    loadMethodologySlice(supabase, "analyst"),
  ]);
  return { house, chat, scripts, analyst };
}

/**
 * Atomic-ish save: read current content (or seed from file), snapshot it
 * into _versions, upsert the new content. The snapshot stores the PRIOR
 * version so a revert is "copy this version's content back as a new save".
 */
export async function saveHouseSlice(
  supabase: MasterBotSupabaseClient,
  args: {
    slice: MethodologySlice;
    newContent: string;
    summary: string;
    updatedBy: string | null;
  },
): Promise<void> {
  const newContent = args.newContent.trim();
  if (newContent.length === 0) throw new Error("saveHouseSlice: content empty");
  const summary = args.summary.trim();
  if (summary.length === 0) throw new Error("saveHouseSlice: summary empty");

  const prior = await loadMethodologySlice(supabase, args.slice);

  const { error: versionErr } = await supabase
    .from("house_methodology_versions")
    .insert({
      slice: args.slice,
      content: prior,
      summary,
      created_by: args.updatedBy,
    });
  if (versionErr) throw new Error(`saveHouseSlice version: ${versionErr.message}`);

  const { error: upsertErr } = await supabase
    .from("house_methodology")
    .upsert(
      {
        slice: args.slice,
        content: newContent,
        updated_by: args.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slice" },
    );
  if (upsertErr) throw new Error(`saveHouseSlice upsert: ${upsertErr.message}`);

  log.info("house slice saved", {
    slice: args.slice,
    prior_chars: prior.length,
    new_chars: newContent.length,
    delta: newContent.length - prior.length,
  });
}

export async function listRecentHouseVersions(
  supabase: MasterBotSupabaseClient,
  opts: { limit?: number } = {},
): Promise<HouseVersion[]> {
  const limit = opts.limit ?? 20;
  const { data, error } = await supabase
    .from("house_methodology_versions")
    .select("id, slice, content, summary, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentHouseVersions: ${error.message}`);
  return (data ?? []) as HouseVersion[];
}

export async function getHouseVersion(
  supabase: MasterBotSupabaseClient,
  id: string,
): Promise<HouseVersion | null> {
  const { data, error } = await supabase
    .from("house_methodology_versions")
    .select("id, slice, content, summary, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getHouseVersion: ${error.message}`);
  return (data as HouseVersion | null) ?? null;
}

/* ---------------------------------------------------------------------------
 * House proposals (staged edits awaiting Apply / Discard)
 * ------------------------------------------------------------------------- */

export interface HouseProposal {
  id: string;
  slice: MethodologySlice;
  new_content: string;
  summary: string;
  status: "pending" | "applied" | "discarded";
  proposed_by: string | null;
  created_at: string;
}

export async function createHouseProposal(
  supabase: MasterBotSupabaseClient,
  args: {
    slice: MethodologySlice;
    newContent: string;
    summary: string;
    proposedBy: string | null;
  },
): Promise<HouseProposal> {
  const newContent = args.newContent.trim();
  if (newContent.length === 0) throw new Error("createHouseProposal: content empty");
  const summary = args.summary.trim();
  if (summary.length === 0) throw new Error("createHouseProposal: summary empty");

  const { data, error } = await supabase
    .from("house_methodology_proposals")
    .insert({
      slice: args.slice,
      new_content: newContent,
      summary,
      proposed_by: args.proposedBy,
    })
    .select("id, slice, new_content, summary, status, proposed_by, created_at")
    .single();
  if (error) throw new Error(`createHouseProposal: ${error.message}`);
  return data as HouseProposal;
}

export async function listPendingProposals(
  supabase: MasterBotSupabaseClient,
): Promise<HouseProposal[]> {
  const { data, error } = await supabase
    .from("house_methodology_proposals")
    .select("id, slice, new_content, summary, status, proposed_by, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listPendingProposals: ${error.message}`);
  return (data ?? []) as HouseProposal[];
}

export async function getProposal(
  supabase: MasterBotSupabaseClient,
  id: string,
): Promise<HouseProposal | null> {
  const { data, error } = await supabase
    .from("house_methodology_proposals")
    .select("id, slice, new_content, summary, status, proposed_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProposal: ${error.message}`);
  return (data as HouseProposal | null) ?? null;
}

export async function markProposalDecided(
  supabase: MasterBotSupabaseClient,
  args: { id: string; status: "applied" | "discarded"; decidedBy: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("house_methodology_proposals")
    .update({
      status: args.status,
      decided_by: args.decidedBy,
      decided_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (error) throw new Error(`markProposalDecided: ${error.message}`);
}

/* ---------------------------------------------------------------------------
 * Master Bot messages (shared admin chat thread)
 * ------------------------------------------------------------------------- */

export async function listMasterBotMessages(
  supabase: MasterBotSupabaseClient,
  opts: { limit?: number } = {},
): Promise<MasterBotMessage[]> {
  const limit = opts.limit ?? 200;
  const { data, error } = await supabase
    .from("master_bot_messages")
    .select("id, author_id, role, content, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listMasterBotMessages: ${error.message}`);
  return (data ?? []) as MasterBotMessage[];
}

export async function appendMasterBotMessage(
  supabase: MasterBotSupabaseClient,
  args: {
    authorId: string | null;
    role: "user" | "assistant" | "system";
    content: string;
  },
): Promise<MasterBotMessage> {
  const { data, error } = await supabase
    .from("master_bot_messages")
    .insert({
      author_id: args.authorId,
      role: args.role,
      content: args.content,
    })
    .select("id, author_id, role, content, created_at")
    .single();
  if (error) throw new Error(`appendMasterBotMessage: ${error.message}`);
  return data as MasterBotMessage;
}
