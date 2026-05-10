"use server";

import { redirect } from "next/navigation";

import { createScriptBatch } from "@/engines/content/persistence";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { createLogger } from "@/lib/shared/logger";
import { INNGEST_EVENTS, inngest } from "@/lib/shared/inngest/client";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("scripts.generate");

export type GenerateState = { error?: string };

const DEFAULT_COUNT = 7;

export async function startGeneration(): Promise<GenerateState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("startGeneration without user");
    redirect("/signin");
  }

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) {
    log.warn("startGeneration without DNA", { user_id: user.id });
    return { error: "You need to complete onboarding before we can generate scripts." };
  }

  let batchId: string;
  try {
    batchId = await createScriptBatch(supabase, {
      userId: user.id,
      voiceDnaSnapshot: dna,
      countRequested: DEFAULT_COUNT,
    });
  } catch (err) {
    log.error("createScriptBatch failed", { user_id: user.id, error: err });
    return { error: "Could not start generation. Try again." };
  }

  try {
    await inngest.send({
      name: INNGEST_EVENTS.ScriptsBatchRequested,
      data: { batch_id: batchId, user_id: user.id },
    });
  } catch (err) {
    log.error("inngest.send failed", { batch_id: batchId, user_id: user.id, error: err });
    return {
      error: "Started the batch but could not enqueue the worker. Try again or contact support.",
    };
  }

  log.info("batch enqueued", { batch_id: batchId, user_id: user.id, count: DEFAULT_COUNT });
  redirect(`/scripts/batches/${batchId}`);
}
