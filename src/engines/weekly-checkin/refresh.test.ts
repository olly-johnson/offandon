import { describe, expect, it } from "vitest";

import type { OnboardingAnswers } from "@/engines/voice/types";

import { foldWeekliesIntoAnswers } from "./refresh";
import type { WeeklyCheckinRow } from "./types";

const BASE: OnboardingAnswers = {
  niche: "fitness coaches",
  business_description: "Direct sales for online coaches.",
  goals: ["100K followers"],
  voice_samples: ["Direct, peer-to-peer."],
  what_works: "Specific case studies.",
  where_stuck: "Lead conversion.",
  icp: {
    pain_points: ["Inconsistent leads"],
    desires: ["Predictable revenue"],
    thoughts_at_2am: ["Am I helping anyone?"],
    internal_battles: ["Depth vs volume"],
    dreams: ["Brand peers respect"],
  },
  positioning: {
    core_philosophy: "Coaches grow by becoming someone worth paying.",
    contrarian_belief: "Cold DMs at scale wreck your brand.",
    differentiator: "I run coaching like a product.",
  },
};

function row(weekStart: string, answers: Record<string, string>): WeeklyCheckinRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    userId: "11111111-1111-1111-1111-111111111111",
    weekStart,
    rawResponses: answers,
    submittedAt: `${weekStart}T10:00:00.000Z`,
  };
}

describe("foldWeekliesIntoAnswers", () => {
  it("returns the base unchanged when there are no check-ins", () => {
    const out = foldWeekliesIntoAnswers({ base: BASE, checkins: [] });
    expect(out).toBe(BASE);
  });

  it("appends weekly wins/learned/audience/focus blocks into what_works", () => {
    const checkin = row("2026-05-11", {
      "11. Give me your three biggest wins this week.": "shipped a thing",
      "8. What did you realise, learn, or notice this week?": "people want simple",
      "9. What questions are your audience or clients asking you right now?":
        "how to start",
      "12. What are you focused on next week?": "second video",
    });
    const out = foldWeekliesIntoAnswers({ base: BASE, checkins: [checkin] });
    expect(out.what_works).toContain("Specific case studies.");
    expect(out.what_works).toContain("--- Weekly updates ---");
    expect(out.what_works).toContain("[Week of 2026-05-11]");
    expect(out.what_works).toContain("Wins: shipped a thing");
    expect(out.what_works).toContain("Learned: people want simple");
    expect(out.what_works).toContain("Audience asking: how to start");
    expect(out.what_works).toContain("Focused next: second video");
  });

  it("appends struggles + mind blocks into where_stuck", () => {
    const checkin = row("2026-05-11", {
      "10. What are you struggling with right now?": "filming consistency",
      "7. What's the biggest thing on your mind right now, positive AND negative?":
        "burnout vs momentum",
    });
    const out = foldWeekliesIntoAnswers({ base: BASE, checkins: [checkin] });
    expect(out.where_stuck).toContain("Lead conversion.");
    expect(out.where_stuck).toContain("Struggles: filming consistency");
    expect(out.where_stuck).toContain("On mind: burnout vs momentum");
  });

  it("skips empty answers and weeks with no usable fields", () => {
    const empty = row("2026-04-27", {
      "11. Give me your three biggest wins this week.": "   ",
    });
    const useful = row("2026-05-04", {
      "11. Give me your three biggest wins this week.": "got 5 leads",
    });
    const out = foldWeekliesIntoAnswers({
      base: BASE,
      checkins: [empty, useful],
    });
    expect(out.what_works).toContain("[Week of 2026-05-04]");
    expect(out.what_works).not.toContain("[Week of 2026-04-27]");
  });
});
