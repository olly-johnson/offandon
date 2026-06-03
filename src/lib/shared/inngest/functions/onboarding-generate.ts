import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { commitClientIngestion, IngestionExtractor } from "@/engines/ingestion";
import { buildIdentitySourceFiles, extractDisplayName } from "@/engines/onboarding";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { loadGhlConfig, upsertContact } from "@/engines/ghl";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  inngest,
  INNGEST_EVENTS,
  type OnboardingIdentitySubmittedData,
} from "../client";

const log = createLogger("inngest.onboarding-generate");

const ONBOARDING_DONE_TAG = "onboarding_complete";

/**
 * onboarding/identity.submitted handler (BO-081).
 *
 * Turns a completed Identity Foundation submission into a working creator:
 *   1. format the answers into one source document,
 *   2. LLM-extract the full Voice DNA (reusing the operator-ingestion
 *      extractor: profile + voice_dna + client_assets + user_memories),
 *   3. commit it for the user (idempotent supersede-and-insert on voice_dna),
 *   4. mark the data-policy gate accepted (so consent-gated features run),
 *   5. tag the GHL contact `onboarding_complete` so the pipeline advances.
 *
 * Per-user serialisation so a re-submission can't race the commit.
 */
export const onboardingGenerate = inngest.createFunction(
  {
    id: "onboarding-generate",
    name: "Onboarding: generate Voice DNA from Identity Foundation",
    retries: 2,
    concurrency: { key: "event.data.user_id", limit: 1 },
    triggers: [{ event: INNGEST_EVENTS.OnboardingIdentitySubmitted }],
  },
  async ({ event, step }) => {
    const { user_id: userId, email, answers } =
      event.data as OnboardingIdentitySubmittedData;
    const supabase = createSupabaseAdminClient();

    const displayName = extractDisplayName(answers);

    const data = await step.run("extract-voice-dna", async () => {
      const extractor = new IngestionExtractor({
        llm: new AnthropicLLMClient({
          onUsage: buildUsageRecorder({ userId, surface: "voice_dna" }),
        }),
      });
      return extractor.extract({
        clientSlug: email,
        files: buildIdentitySourceFiles(answers, displayName),
        nowIso: new Date().toISOString(),
      });
    });

    await step.run("commit", () =>
      commitClientIngestion({ supabase, userId, data }),
    );

    // Paid + onboarded -> they've accepted the data policy. The CHECK needs
    // the timestamp set alongside the flag (see project memory).
    await step.run("accept-data-policy", async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          data_policy_accepted: true,
          data_policy_accepted_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .is("data_policy_accepted", false);
      if (error) throw new Error(`accept-data-policy: ${error.message}`);
    });

    // Best-effort GHL pipeline advance; don't fail the whole run if GHL is
    // misconfigured (the account + Voice DNA are already committed).
    await step.run("tag-ghl", async () => {
      try {
        const config = loadGhlConfig();
        await upsertContact(config, {
          email,
          name: displayName,
          tags: [ONBOARDING_DONE_TAG],
          source: "onboarding",
        });
      } catch (err) {
        log.warn("ghl onboarding tag failed (non-fatal)", {
          user_id: userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    log.info("onboarding voice dna generated", {
      user_id: userId,
      email,
      display_name: data.profile.display_name,
      assets: data.client_assets.length,
      memories: data.user_memories.length,
    });

    return { user_id: userId, display_name: data.profile.display_name };
  },
);
