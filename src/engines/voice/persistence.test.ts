import { describe, expect, it, vi } from "vitest";

import { getCurrentVoiceDNA, saveVoiceDNA, type VoiceSupabaseClient } from "./persistence";
import type { OnboardingAnswers, VoiceDNA } from "./types";

const FIXTURE_DNA: VoiceDNA = {
  tone_profile: {
    primary: "professional-direct",
    energy: "high",
    formality: "conversational",
    descriptors: ["strategic", "direct"],
  },
  content_pillars: [
    {
      name: "Operator Frameworks",
      description: "Repeatable systems for client acquisition.",
      example_topics: ["Lead-gen audit checklists"],
    },
  ],
  prohibited_phrases: ["delve"],
  audience_persona: {
    description: "Coaches who want serious clients.",
    pain_points: ["Inconsistent leads"],
    aspirations: ["Predictable revenue"],
    language_register: "operator-to-operator",
  },
  generated_at: "2026-05-09T12:00:00.000Z",
  source_questionnaire_hash: "a".repeat(64),
};

const FIXTURE_ANSWERS: OnboardingAnswers = {
  niche: "fitness coaches",
  business_description: "Direct sales for online coaches.",
  goals: ["100K followers"],
  voice_samples: ["Direct, peer-to-peer."],
  what_works: "Specific case studies.",
  where_stuck: "Lead conversion.",
  target_audience: "Coaches under 5K MRR.",
};

function mockClientWithRpc(
  result: { data: unknown; error: { message: string } | null },
) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as VoiceSupabaseClient, rpc };
}

function mockClientWithSelect(
  result: { data: unknown; error: { message: string } | null },
) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const is = vi.fn().mockReturnValue({ maybeSingle });
  const eq = vi.fn().mockReturnValue({ is });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as VoiceSupabaseClient, from, select, eq, is, maybeSingle };
}

describe("saveVoiceDNA", () => {
  it("calls replace_voice_dna RPC with dna, answers, and the questionnaire hash", async () => {
    const { client, rpc } = mockClientWithRpc({ data: null, error: null });

    await saveVoiceDNA(client, FIXTURE_DNA, FIXTURE_ANSWERS);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("replace_voice_dna", {
      p_dna: FIXTURE_DNA,
      p_source_answers: FIXTURE_ANSWERS,
      p_source_questionnaire_hash: FIXTURE_DNA.source_questionnaire_hash,
    });
  });

  it("does NOT pass userId; identity comes from the JWT inside the RPC", async () => {
    const { client, rpc } = mockClientWithRpc({ data: null, error: null });

    await saveVoiceDNA(client, FIXTURE_DNA, FIXTURE_ANSWERS);

    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(args)).toEqual(
      expect.arrayContaining(["p_dna", "p_source_answers", "p_source_questionnaire_hash"]),
    );
    expect(Object.keys(args)).not.toContain("p_user_id");
    expect(Object.keys(args)).not.toContain("user_id");
  });

  it("throws when the RPC returns an error", async () => {
    const { client } = mockClientWithRpc({
      data: null,
      error: { message: "rpc denied" },
    });

    await expect(saveVoiceDNA(client, FIXTURE_DNA, FIXTURE_ANSWERS)).rejects.toThrow(/rpc denied/);
  });
});

describe("getCurrentVoiceDNA", () => {
  it("queries voice_dna with the active-row filter and returns the dna jsonb", async () => {
    const { client, from, select, eq, is } = mockClientWithSelect({
      data: { dna: FIXTURE_DNA },
      error: null,
    });

    const result = await getCurrentVoiceDNA(client, "user-123");

    expect(from).toHaveBeenCalledWith("voice_dna");
    expect(select).toHaveBeenCalledWith("dna");
    expect(eq).toHaveBeenCalledWith("user_id", "user-123");
    expect(is).toHaveBeenCalledWith("superseded_at", null);
    expect(result).toEqual(FIXTURE_DNA);
  });

  it("returns null when no active dna exists for the user", async () => {
    const { client } = mockClientWithSelect({ data: null, error: null });

    const result = await getCurrentVoiceDNA(client, "user-123");

    expect(result).toBeNull();
  });

  it("throws on a Supabase error", async () => {
    const { client } = mockClientWithSelect({
      data: null,
      error: { message: "rls denied" },
    });

    await expect(getCurrentVoiceDNA(client, "user-123")).rejects.toThrow(/rls denied/);
  });
});
