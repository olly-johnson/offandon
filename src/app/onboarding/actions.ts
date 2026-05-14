"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { saveVoiceDNA } from "@/engines/voice/persistence";
import { VoiceEngine } from "@/engines/voice/voice";
import { createLogger, timed } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("onboarding.submit");

const RankedList = (label: string) =>
  z.array(z.string().trim().min(2)).min(1, `Add at least one ${label}.`);

const OnboardingSchema = z.object({
  niche: z.string().trim().min(2, "Tell us your niche."),
  business_description: z.string().trim().min(10, "Add a bit more about your business."),
  voice_samples: z
    .array(z.string().trim().min(20, "Each voice sample needs at least 20 characters."))
    .min(1, "We need at least one voice sample."),
  what_works: z.string().trim().min(5, "What's been working for you?"),
  where_stuck: z.string().trim().min(5, "Where are you stuck?"),
  goals: z.array(z.string().trim().min(2)).min(1, "List at least one goal."),

  // Required structured ICP, replacing the old freeform target_audience field.
  icp: z.object({
    pain_points: RankedList("pain point"),
    desires: RankedList("desire"),
    thoughts_at_2am: RankedList("2am thought"),
    internal_battles: RankedList("internal battle"),
    dreams: RankedList("dream"),
  }),

  // Required positioning. SCCCC contrast/clarity needs a defined contrarian stance.
  positioning: z.object({
    core_philosophy: z.string().trim().min(10, "Add your core philosophy in one sentence."),
    contrarian_belief: z.string().trim().min(10, "What does most of your industry get wrong?"),
    differentiator: z.string().trim().min(10, "What separates you from the rest of the niche?"),
  }),

  // Optional. Strongly encouraged but the creator can grow the bank later.
  story_bank: z
    .object({
      rock_bottom: z.string().trim().min(1).optional(),
      breakthrough: z.string().trim().min(1).optional(),
      current_journey: z.string().trim().min(1).optional(),
    })
    .optional(),

  // Optional voice dials.
  voice_signals: z
    .object({
      signature_phrases: z.array(z.string().trim().min(1)).optional(),
      swearing_level: z.enum(["none", "light", "strategic", "frequent"]),
      humor_style: z.enum(["self_deprecating", "dry", "banter", "none"]),
      energy: z.enum(["calm_authority", "high_energy", "reflective", "intense"]),
    })
    .optional(),

  example_creators: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        platform: z.string().trim().optional(),
        why: z.string().trim().optional(),
      }),
    )
    .optional(),

  preferred_topics: z.array(z.string().trim().min(2)).optional(),
  user_prohibited_phrases: z.array(z.string().trim().min(1)).optional(),
});

export type OnboardingState = { error?: string };

export async function submitOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  // Multi-value fields arrive as JSON-encoded strings from the wizard so
  // FormData stays flat. Single-value fields come through directly. Nested
  // objects (icp, positioning, story_bank, voice_signals, example_creators)
  // are JSON.stringify'd by the wizard and parsed back here.
  const raw = {
    niche: formData.get("niche") ?? "",
    business_description: formData.get("business_description") ?? "",
    what_works: formData.get("what_works") ?? "",
    where_stuck: formData.get("where_stuck") ?? "",
    voice_samples: parseJsonArray(formData.get("voice_samples")),
    goals: parseJsonArray(formData.get("goals")),
    icp: parseJsonObject(formData.get("icp")),
    positioning: parseJsonObject(formData.get("positioning")),
    story_bank: parseJsonObject(formData.get("story_bank")),
    voice_signals: parseJsonObject(formData.get("voice_signals")),
    example_creators: parseJsonObject(formData.get("example_creators")),
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
        const engine = new VoiceEngine({
          llm: new AnthropicLLMClient({
            onUsage: buildUsageRecorder({ userId: user.id, surface: "voice_dna" }),
          }),
        });
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

/**
 * Parse a nested object payload from the wizard. Returns undefined when
 * the field is missing or invalid, which lets Zod treat the field as
 * unset and surface its own error message for required nested objects.
 */
function parseJsonObject(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value === "") return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}
