"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { saveVoiceDNA } from "@/engines/voice/persistence";
import { VoiceEngine } from "@/engines/voice/voice";
import { createLogger, timed } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("onboarding.submit");

const OnboardingSchema = z.object({
  niche: z.string().trim().min(2, "Tell us your niche."),
  business_description: z.string().trim().min(10, "Add a bit more about your business."),
  target_audience: z.string().trim().min(5, "Describe your target audience."),
  voice_samples: z
    .array(z.string().trim().min(20, "Each voice sample needs at least 20 characters."))
    .min(1, "We need at least one voice sample."),
  what_works: z.string().trim().min(5, "What's been working for you?"),
  where_stuck: z.string().trim().min(5, "Where are you stuck?"),
  goals: z.array(z.string().trim().min(2)).min(1, "List at least one goal."),
  preferred_topics: z.array(z.string().trim().min(2)).optional(),
  user_prohibited_phrases: z.array(z.string().trim().min(1)).optional(),
});

export type OnboardingState = { error?: string };

export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Multi-value fields arrive as JSON-encoded strings from the wizard so
  // FormData stays flat. Single-value fields come through directly.
  const raw = {
    niche: formData.get("niche") ?? "",
    business_description: formData.get("business_description") ?? "",
    target_audience: formData.get("target_audience") ?? "",
    what_works: formData.get("what_works") ?? "",
    where_stuck: formData.get("where_stuck") ?? "",
    voice_samples: parseJsonArray(formData.get("voice_samples")),
    goals: parseJsonArray(formData.get("goals")),
    preferred_topics: parseJsonArray(formData.get("preferred_topics")),
    user_prohibited_phrases: parseJsonArray(formData.get("user_prohibited_phrases")),
  };

  const parsed = OnboardingSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    log.warn("validation failed", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), msg: i.message })),
    });
    return { error: first?.message ?? "Some answers are missing." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("submit without user");
    redirect("/signin");
  }

  // 1. Generate Voice DNA via the production Claude client.
  let dna;
  try {
    dna = await timed(
      log,
      "voice.generate",
      async () => {
        const engine = new VoiceEngine({ llm: new AnthropicLLMClient() });
        return engine.generateDNA(parsed.data);
      },
      { user_id: user.id, niche: parsed.data.niche },
    );
  } catch (err) {
    log.error("generateDNA failed", { user_id: user.id, error: err });
    return {
      error: "Could not generate your Voice DNA. Try again, or contact support if it keeps failing.",
    };
  }

  // 2. Upsert the profile row. data_policy_accepted is set here because
  //    submitting the onboarding form is the affirmative GDPR consent step.
  const now = new Date().toISOString();
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      data_policy_accepted: true,
      data_policy_accepted_at: now,
    });
  if (profileErr) {
    log.error("profile upsert failed", {
      user_id: user.id,
      code: profileErr.code,
      message: profileErr.message,
    });
    return { error: "Could not save your profile. Try again." };
  }

  // 3. Persist the Voice DNA via the atomic RPC.
  try {
    await timed(log, "voice.save", () => saveVoiceDNA(supabase, dna, parsed.data), {
      user_id: user.id,
    });
  } catch (err) {
    log.error("saveVoiceDNA failed", { user_id: user.id, error: err });
    return { error: "Generated your Voice DNA but could not save it. Try again." };
  }

  log.info("onboarding complete", {
    user_id: user.id,
    primary_tone: dna.tone_profile.primary,
    pillar_count: dna.content_pillars.length,
  });

  redirect("/dashboard");
}

function parseJsonArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string" && v.trim().length > 0) : [];
  } catch {
    return [];
  }
}
