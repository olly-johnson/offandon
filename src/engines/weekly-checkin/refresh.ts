/**
 * Build an extended OnboardingAnswers by folding the user's accumulated
 * weekly check-ins into the original answers shape (BO-060).
 *
 * The Voice Engine's input contract is OnboardingAnswers and we don't
 * want to widen it for one consumer, so we stay inside the schema by
 * appending synthesised paragraphs to `what_works` and `where_stuck` —
 * the two free-text fields. The voice system prompt stringifies the
 * whole shape, so the LLM picks the new content up without prompt edits.
 *
 * Format kept terse-and-dated so the prompt stays scannable. Older
 * weekly entries are kept in (no truncation) — Voice DNA generation
 * runs once a week, not per-message, so prompt size isn't hot.
 */

import type { OnboardingAnswers } from "@/engines/voice/types";

import type { WeeklyCheckinRow } from "./types";

/** Form field titles, kept aligned with examples/create_weekly_checkin_form.py. */
const Q_WINS = "11. Give me your three biggest wins this week.";
const Q_STRUGGLES = "10. What are you struggling with right now?";
const Q_AUDIENCE_QS = "9. What questions are your audience or clients asking you right now?";
const Q_LEARNED = "8. What did you realise, learn, or notice this week?";
const Q_MIND = "7. What's the biggest thing on your mind right now, positive AND negative?";
const Q_FOCUS = "12. What are you focused on next week?";
const Q_OTHER = "13. Anything else your bot should know?";

function answer(row: WeeklyCheckinRow, key: string): string | null {
  const v = row.rawResponses[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatWinsBlock(checkins: WeeklyCheckinRow[]): string {
  const blocks: string[] = [];
  for (const c of checkins) {
    const lines: string[] = [];
    const wins = answer(c, Q_WINS);
    const learned = answer(c, Q_LEARNED);
    const audience = answer(c, Q_AUDIENCE_QS);
    const focus = answer(c, Q_FOCUS);
    const other = answer(c, Q_OTHER);
    if (wins) lines.push(`Wins: ${wins}`);
    if (learned) lines.push(`Learned: ${learned}`);
    if (audience) lines.push(`Audience asking: ${audience}`);
    if (focus) lines.push(`Focused next: ${focus}`);
    if (other) lines.push(`Other: ${other}`);
    if (lines.length === 0) continue;
    blocks.push(`[Week of ${c.weekStart}]\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

function formatStrugglesBlock(checkins: WeeklyCheckinRow[]): string {
  const blocks: string[] = [];
  for (const c of checkins) {
    const lines: string[] = [];
    const struggles = answer(c, Q_STRUGGLES);
    const mind = answer(c, Q_MIND);
    if (struggles) lines.push(`Struggles: ${struggles}`);
    if (mind) lines.push(`On mind: ${mind}`);
    if (lines.length === 0) continue;
    blocks.push(`[Week of ${c.weekStart}]\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

export interface FoldWeekliesInput {
  base: OnboardingAnswers;
  checkins: WeeklyCheckinRow[];
}

export function foldWeekliesIntoAnswers(
  input: FoldWeekliesInput,
): OnboardingAnswers {
  if (input.checkins.length === 0) return input.base;

  const winsBlock = formatWinsBlock(input.checkins);
  const strugglesBlock = formatStrugglesBlock(input.checkins);

  const what_works = winsBlock
    ? [input.base.what_works.trim(), "\n--- Weekly updates ---", winsBlock]
        .filter(Boolean)
        .join("\n\n")
    : input.base.what_works;

  const where_stuck = strugglesBlock
    ? [input.base.where_stuck.trim(), "\n--- Weekly updates ---", strugglesBlock]
        .filter(Boolean)
        .join("\n\n")
    : input.base.where_stuck;

  return { ...input.base, what_works, where_stuck };
}
