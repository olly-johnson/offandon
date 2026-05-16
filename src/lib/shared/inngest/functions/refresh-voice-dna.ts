import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { VoiceEngine } from "@/engines/voice";
import {
  adminReplaceVoiceDNA,
  foldWeekliesIntoAnswers,
  getActiveVoiceDNAForUser,
  listCheckinsForUser,
} from "@/engines/weekly-checkin";
import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  inngest,
  INNGEST_EVENTS,
  type VoiceDnaRefreshRequestedData,
} from "../client";

const log = createLogger("inngest.refresh-voice-dna");

/**
 * voice/dna.refresh.requested handler (BO-060).
 *
 * Triggered by the weekly-checkin webhook after a successful insert.
 * Folds the user's accumulated weekly check-ins into their onboarding
 * answers (via the `what_works` + `where_stuck` fields the Voice prompt
 * already reads) and regenerates the active Voice DNA row.
 *
 * Per-user serialisation: concurrency.key=event.data.user_id ensures
 * two webhooks for the same user (rare but possible if an operator edits
 * a response in Google Forms) don't race the supersede + insert pair.
 */
export const refreshVoiceDna = inngest.createFunction(
  {
    id: "refresh-voice-dna",
    name: "Voice DNA: weekly refresh",
    retries: 2,
    concurrency: { key: "event.data.user_id", limit: 1 },
    triggers: [{ event: INNGEST_EVENTS.VoiceDnaRefreshRequested }],
  },
  async ({ event, step }) => {
    const { user_id: userId, week_start: weekStart } =
      event.data as VoiceDnaRefreshRequestedData;
    const supabase = createSupabaseAdminClient();

    const active = await step.run("load-active-voice-dna", () =>
      getActiveVoiceDNAForUser(supabase, userId),
    );
    if (!active) {
      log.warn("no active voice_dna; skipping refresh", { user_id: userId });
      return { skipped: true, reason: "no_active_voice_dna" };
    }

    const checkins = await step.run("load-checkins", () =>
      listCheckinsForUser(supabase, userId),
    );

    const answers = foldWeekliesIntoAnswers({
      base: active.source_answers,
      checkins,
    });

    const dna = await step.run("regenerate-dna", async () => {
      const engine = new VoiceEngine({
        llm: new AnthropicLLMClient({
          onUsage: buildUsageRecorder({ userId, surface: "voice_dna" }),
        }),
      });
      return engine.generateDNA(answers);
    });

    await step.run("save-dna", () =>
      adminReplaceVoiceDNA(supabase, userId, dna, answers),
    );

    log.info("voice dna refreshed", {
      user_id: userId,
      week_start: weekStart ?? null,
      checkins_count: checkins.length,
      primary_tone: dna.tone_profile.primary,
    });

    return {
      user_id: userId,
      checkins_count: checkins.length,
    };
  },
);

// Re-export inngest so importers that need to send the event have a
// single bind point. Keeps the function module self-contained.
export { inngest };
