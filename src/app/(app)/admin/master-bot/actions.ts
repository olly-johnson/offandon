"use server";

import { revalidatePath } from "next/cache";

import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { isAdmin } from "@/engines/admin/auth";
import {
  addRule,
  appendMasterBotMessage,
  createHouseProposal,
  deleteRule,
  getProposal,
  listActiveRules,
  listMasterBotMessages,
  loadAllMethodologySlices,
  markProposalDecided,
  saveHouseSlice,
  updateRule,
  type MasterBotSupabaseClient,
} from "@/engines/master-bot/persistence";
import { MasterBotEngine } from "@/engines/master-bot/master-bot-engine";
import { buildMasterBotSystemPrompt } from "@/engines/master-bot/system-prompt";
import { buildMasterBotTools } from "@/engines/master-bot/tools";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { createLogger } from "@/lib/shared/logger";
import type { MethodologySlice } from "@/lib/shared/methodology";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("admin.master-bot.actions");

export type ActionState = { error?: string } | void;

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    log.warn("non-admin invoked master-bot action", { user_id: user?.id });
    return { error: "admin only" };
  }
  return { userId: user.id };
}

function groupRulesForPrompt(
  rules: Array<{ id: string; slice: MethodologySlice; rule: string }>,
): Record<MethodologySlice, Array<{ id: string; rule: string }>> {
  const groups: Record<MethodologySlice, Array<{ id: string; rule: string }>> = {
    house: [],
    chat: [],
    scripts: [],
    analyst: [],
  };
  for (const r of rules) {
    groups[r.slice].push({ id: r.id, rule: r.rule });
  }
  return groups;
}

/**
 * Send a message in the Master Bot thread.
 *
 * The bot can call tools that immediately commit (rules CRUD) or stage a
 * house edit as a pending proposal. The admin clicks Apply / Discard on
 * the proposal card to commit Layer 2 changes.
 */
export async function sendMasterBotMessage(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const text = (form.get("message") ?? "").toString().trim();
  if (text.length === 0) return { error: "Type a message before sending." };

  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  const userId = auth.userId;

  const admin: MasterBotSupabaseClient = createSupabaseAdminClient();

  await appendMasterBotMessage(admin, {
    authorId: userId,
    role: "user",
    content: text,
  });

  // Build the system prompt off DB state so the bot sees the latest
  // methodology + rules every turn.
  const [slices, rules, history] = await Promise.all([
    loadAllMethodologySlices(admin),
    listActiveRules(admin),
    listMasterBotMessages(admin, { limit: 100 }),
  ]);

  const system = buildMasterBotSystemPrompt({
    slices,
    rulesBySlice: groupRulesForPrompt(rules),
  });

  const tools = buildMasterBotTools({
    add_rule: async ({ slice, rule }) => {
      if (!isMethodologySlice(slice)) return `Error: unknown slice "${slice}"`;
      try {
        const row = await addRule(admin, { slice, rule, createdBy: userId });
        return `Added rule [${row.id}] under ${slice}: "${row.rule}"`;
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
    update_rule: async ({ id, rule }) => {
      try {
        const row = await updateRule(admin, { id, rule });
        return `Updated rule [${row.id}]: "${row.rule}"`;
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
    delete_rule: async ({ id }) => {
      try {
        await deleteRule(admin, { id });
        return `Deleted rule [${id}].`;
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
    propose_house_edit: async ({ slice, new_content, summary }) => {
      if (!isMethodologySlice(slice)) return `Error: unknown slice "${slice}"`;
      try {
        const p = await createHouseProposal(admin, {
          slice,
          newContent: new_content,
          summary,
          proposedBy: userId,
        });
        return `Proposal [${p.id}] staged for ${slice}. Awaiting admin Apply / Discard.`;
      } catch (err) {
        return `Error: ${(err as Error).message}`;
      }
    },
  });

  const engine = new MasterBotEngine(
    new AnthropicLLMClient({
      onUsage: buildUsageRecorder({ userId, surface: "other" }),
    }),
  );

  try {
    const reply = await engine.reply({
      systemPrompt: system,
      history: history.map((m) => ({
        role: m.role === "system" ? "user" : (m.role as "user" | "assistant"),
        content: m.content,
      })),
      tools,
    });

    await appendMasterBotMessage(admin, {
      authorId: null,
      role: "assistant",
      content: reply.text,
    });

    log.info("master-bot reply", {
      user_id: userId,
      tool_count: reply.tool_actions.length,
    });
  } catch (err) {
    log.error("master-bot reply failed", {
      user_id: userId,
      message: err instanceof Error ? err.message : String(err),
    });
    await appendMasterBotMessage(admin, {
      authorId: null,
      role: "system",
      content: "Failed to reply. Try again.",
    });
    return { error: "Bot failed to reply. Try again." };
  }

  revalidatePath("/admin/master-bot");
}

export async function applyProposal(proposalId: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createSupabaseAdminClient();
  const proposal = await getProposal(admin, proposalId);
  if (!proposal || proposal.status !== "pending") {
    return { error: "Proposal not found or already decided." };
  }

  await saveHouseSlice(admin, {
    slice: proposal.slice,
    newContent: proposal.new_content,
    summary: proposal.summary,
    updatedBy: auth.userId,
  });
  await markProposalDecided(admin, {
    id: proposalId,
    status: "applied",
    decidedBy: auth.userId,
  });
  await appendMasterBotMessage(admin, {
    authorId: auth.userId,
    role: "system",
    content: `Applied proposal for ${proposal.slice}: ${proposal.summary}`,
  });

  log.info("proposal applied", {
    proposal_id: proposalId,
    slice: proposal.slice,
    user_id: auth.userId,
  });

  revalidatePath("/admin/master-bot");
}

export async function discardProposal(proposalId: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;

  const admin = createSupabaseAdminClient();
  const proposal = await getProposal(admin, proposalId);
  if (!proposal || proposal.status !== "pending") {
    return { error: "Proposal not found or already decided." };
  }

  await markProposalDecided(admin, {
    id: proposalId,
    status: "discarded",
    decidedBy: auth.userId,
  });
  await appendMasterBotMessage(admin, {
    authorId: auth.userId,
    role: "system",
    content: `Discarded proposal for ${proposal.slice}.`,
  });

  log.info("proposal discarded", {
    proposal_id: proposalId,
    slice: proposal.slice,
  });

  revalidatePath("/admin/master-bot");
}

export async function deleteRuleAction(ruleId: string): Promise<ActionState> {
  const auth = await requireAdmin();
  if ("error" in auth) return auth;
  const admin = createSupabaseAdminClient();
  await deleteRule(admin, { id: ruleId });
  revalidatePath("/admin/master-bot");
}

function isMethodologySlice(s: string): s is MethodologySlice {
  return s === "house" || s === "chat" || s === "scripts" || s === "analyst";
}
