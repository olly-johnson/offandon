"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  HookGenerator,
  IMFExtractor,
  ScriptRefineChat,
  SingleScriptGenerator,
  type GeneratedHookBatch,
  type GeneratedSingleScript,
  type IMF,
  type ScriptAngle,
  type ScriptRefineChatTurn,
  type ScriptRefineProposal,
} from "@/engines/content";
import { deleteScriptForUser, saveSingleScript } from "@/engines/content/persistence";
import { getUserMethodology } from "@/engines/methodology/persistence";
import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import {
  listRulesForSlicePrompt,
  loadMethodologySlice,
} from "@/engines/master-bot/persistence";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { SlopError } from "@/lib/shared/anti-slop";
import { createLogger, timed } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("scripts.wizard.actions");

export type WizardError = { error: string };

/**
 * Step 2: extract IMF (Idea / Message / Feel) from the concept.
 * Called from the client when the user lands on step 2 with a concept.
 */
export async function extractIMFAction(
  concept: string,
): Promise<{ imf: IMF } | WizardError> {
  if (!concept || concept.trim().length < 8) {
    return { error: "Concept is too short to extract from. Add a couple of sentences first." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("extractIMFAction without user");
    redirect("/signin");
  }
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) return { error: "You need to complete onboarding first." };

  const admin = createSupabaseAdminClient();
  const [userMethodology, methodologyHouse, scriptsSlice, operatorRules] =
    await Promise.all([
      getUserMethodology(supabase, user.id),
      loadMethodologySlice(admin, "house"),
      loadMethodologySlice(admin, "scripts"),
      listRulesForSlicePrompt(admin, "scripts"),
    ]);
  const methodologyContext = {
    house: methodologyHouse,
    scripts: scriptsSlice,
    operatorRules,
  };

  try {
    const imf = await timed(
      log,
      "imf.extract",
      async () => {
        const extractor = new IMFExtractor({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user.id, surface: "imf" }),
          }),
        });
        return extractor.extract({
          voiceDna: dna,
          concept,
          userMethodology,
          methodologyContext,
        });
      },
      { user_id: user.id, concept_chars: concept.length },
    );
    return { imf };
  } catch (err) {
    log.error("extractIMFAction failed", {
      user_id: user.id,
      slop: err instanceof SlopError,
      error: (err as Error).message,
    });
    return {
      error:
        err instanceof SlopError
          ? "The extractor produced output that failed the slop validator. Try rephrasing the concept."
          : "Could not extract IMF. Try filling in the fields manually.",
    };
  }
}

/**
 * Step 3: generate a batch of hooks from concept + (optional) IMF.
 */
export async function generateHooksAction(input: {
  concept: string;
  imf?: IMF;
  count?: number;
}): Promise<{ batch: GeneratedHookBatch } | WizardError> {
  if (!input.concept || input.concept.trim().length < 8) {
    return { error: "Concept is required." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("generateHooksAction without user");
    redirect("/signin");
  }
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) return { error: "You need to complete onboarding first." };

  const admin = createSupabaseAdminClient();
  const [userMethodology, methodologyHouse, scriptsSlice, operatorRules] =
    await Promise.all([
      getUserMethodology(supabase, user.id),
      loadMethodologySlice(admin, "house"),
      loadMethodologySlice(admin, "scripts"),
      listRulesForSlicePrompt(admin, "scripts"),
    ]);
  const methodologyContext = {
    house: methodologyHouse,
    scripts: scriptsSlice,
    operatorRules,
  };

  try {
    const batch = await timed(
      log,
      "hooks.generate",
      async () => {
        const generator = new HookGenerator({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user.id, surface: "hooks" }),
          }),
        });
        return generator.generateHooks({
          voiceDna: dna,
          concept: input.concept,
          imf: input.imf,
          count: input.count ?? 6,
          userMethodology,
          methodologyContext,
        });
      },
      { user_id: user.id, count: input.count ?? 6 },
    );
    return { batch };
  } catch (err) {
    log.error("generateHooksAction failed", {
      user_id: user.id,
      slop: err instanceof SlopError,
      error: (err as Error).message,
    });
    return {
      error:
        err instanceof SlopError
          ? "Hooks failed the slop validator. Try regenerating."
          : "Could not generate hooks. Try again.",
    };
  }
}

/**
 * Step 4: generate ONE finished script from concept + IMF + locked hook.
 * Optional refinement note is appended (used by step 5's regenerate).
 */
export async function generateSingleScriptAction(input: {
  concept: string;
  imf?: IMF;
  hook: string;
  refinement?: string;
}): Promise<{ script: GeneratedSingleScript } | WizardError> {
  if (!input.concept || input.concept.trim().length < 8) {
    return { error: "Concept is required." };
  }
  if (!input.hook || input.hook.trim().length === 0) {
    return { error: "Pick a hook before generating a script." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("generateSingleScriptAction without user");
    redirect("/signin");
  }
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) return { error: "You need to complete onboarding first." };

  const admin = createSupabaseAdminClient();
  const [userMethodology, methodologyHouse, scriptsSlice, operatorRules] =
    await Promise.all([
      getUserMethodology(supabase, user.id),
      loadMethodologySlice(admin, "house"),
      loadMethodologySlice(admin, "scripts"),
      listRulesForSlicePrompt(admin, "scripts"),
    ]);
  const methodologyContext = {
    house: methodologyHouse,
    scripts: scriptsSlice,
    operatorRules,
  };

  try {
    const script = await timed(
      log,
      "single-script.generate",
      async () => {
        const generator = new SingleScriptGenerator({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user.id, surface: "single_script" }),
          }),
        });
        return generator.generateOne({
          voiceDna: dna,
          concept: input.concept,
          imf: input.imf,
          hook: input.hook,
          refinement: input.refinement,
          userMethodology,
          methodologyContext,
        });
      },
      { user_id: user.id, hook_chars: input.hook.length, has_refinement: !!input.refinement },
    );
    return { script };
  } catch (err) {
    log.error("generateSingleScriptAction failed", {
      user_id: user.id,
      slop: err instanceof SlopError,
      error: (err as Error).message,
    });
    return {
      error:
        err instanceof SlopError
          ? "Script failed the slop validator. Try refining or regenerating."
          : "Could not generate the script. Try again.",
    };
  }
}

/**
 * Step 5 (Refine Studio): one conversational turn with the refine
 * assistant. The creator edits the script directly and chats alongside it;
 * when they ask for a change the assistant returns a proposed amendment the
 * UI shows as a diff to accept or reject. The current (possibly hand-edited)
 * script is sent every turn so the model edits exactly what's on screen.
 */
export async function refineScriptChatAction(input: {
  concept: string;
  imf?: IMF;
  currentScript: { hook: string; body: string };
  history: ScriptRefineChatTurn[];
}): Promise<{ reply: string; proposal?: ScriptRefineProposal } | WizardError> {
  if (!input.currentScript?.hook || !input.currentScript?.body) {
    return { error: "There's no script to refine yet." };
  }
  if (!Array.isArray(input.history) || input.history.length === 0) {
    return { error: "Say something to the assistant first." };
  }
  const last = input.history[input.history.length - 1];
  if (last.role !== "user" || last.content.trim().length === 0) {
    return { error: "Type a message before sending." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("refineScriptChatAction without user");
    redirect("/signin");
  }
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) return { error: "You need to complete onboarding first." };

  const admin = createSupabaseAdminClient();
  const [userMethodology, methodologyHouse, scriptsSlice, operatorRules] =
    await Promise.all([
      getUserMethodology(supabase, user.id),
      loadMethodologySlice(admin, "house"),
      loadMethodologySlice(admin, "scripts"),
      listRulesForSlicePrompt(admin, "scripts"),
    ]);
  const methodologyContext = {
    house: methodologyHouse,
    scripts: scriptsSlice,
    operatorRules,
  };

  try {
    const result = await timed(
      log,
      "script-refine.chat",
      async () => {
        const engine = new ScriptRefineChat({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user.id, surface: "script_refine" }),
          }),
        });
        return engine.reply({
          voiceDna: dna,
          concept: input.concept,
          imf: input.imf,
          currentScript: input.currentScript,
          history: input.history,
          userMethodology,
          methodologyContext,
        });
      },
      {
        user_id: user.id,
        turns: input.history.length,
        body_chars: input.currentScript.body.length,
      },
    );
    return {
      reply: result.message.content,
      ...(result.proposal ? { proposal: result.proposal } : {}),
    };
  } catch (err) {
    log.error("refineScriptChatAction failed", {
      user_id: user.id,
      slop: err instanceof SlopError,
      error: (err as Error).message,
    });
    return {
      error:
        err instanceof SlopError
          ? "The assistant's reply tripped the slop validator. Try rephrasing what you'd like changed."
          : "The refine assistant hit an error. Try again.",
    };
  }
}

/**
 * Step 5: persist the finished script to the user's library. Single row,
 * batch_id NULL, status 'draft'.
 */
export async function saveScriptToLibraryAction(input: {
  hook: string;
  body: string;
  /**
   * Passed through from the wizard's GeneratedSingleScript so the
   * dashboard's funnel + pillar charts can tally wizard-saved scripts
   * alongside batch-saved ones (BO-056). Optional for back-compat with
   * any caller that doesn't have them in scope.
   */
  angle?: ScriptAngle;
  pillar?: string;
}): Promise<{ id: string } | WizardError> {
  if (!input.hook || !input.body) {
    return { error: "Nothing to save. Generate a script first." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("saveScriptToLibraryAction without user");
    redirect("/signin");
  }
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) return { error: "You need to complete onboarding first." };

  try {
    const id = await saveSingleScript(supabase, {
      userId: user.id,
      hook: input.hook,
      body: input.body,
      voiceDnaSnapshot: dna,
      angle: input.angle,
      pillar: input.pillar,
    });
    log.info("script saved to library", { user_id: user.id, script_id: id });
    // Re-render the Scripts page so the Library tab picks up the new row.
    revalidatePath("/scripts");
    return { id };
  } catch (err) {
    log.error("saveScriptToLibraryAction failed", {
      user_id: user.id,
      error: (err as Error).message,
    });
    return { error: "Could not save the script. Try again." };
  }
}

/**
 * Library tab: permanently remove a script. Scoped to the signed-in user
 * at the query level, so a forged `scriptId` from another user is a no-op.
 */
export async function deleteScriptAction(
  scriptId: string,
): Promise<{ ok: true } | WizardError> {
  if (!scriptId || typeof scriptId !== "string") {
    return { error: "Missing script id." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("deleteScriptAction without user");
    redirect("/signin");
  }

  try {
    const deleted = await deleteScriptForUser(supabase, {
      userId: user.id,
      scriptId,
    });
    if (!deleted) {
      log.warn("deleteScriptAction: no row matched", { user_id: user.id, script_id: scriptId });
      return { error: "Script not found." };
    }
    log.info("script deleted", { user_id: user.id, script_id: scriptId });
    revalidatePath("/scripts");
    return { ok: true };
  } catch (err) {
    log.error("deleteScriptAction failed", {
      user_id: user.id,
      script_id: scriptId,
      error: (err as Error).message,
    });
    return { error: "Could not delete the script. Try again." };
  }
}
