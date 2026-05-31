/**
 * Weekly check-in email copy (BO-058).
 *
 * Two templates: the Friday-9am-Bali send, and the Saturday-9am-Bali
 * reminder for stragglers. Copy intentionally short and on-brand — no
 * marketing fluff, plain HTML, both html + text bodies so spam filters
 * don't downgrade us. The form URL is injected (env-configurable so
 * staging and prod can point at separate forms).
 *
 * No emojis. No em-dashes. Matches the Humanization Manifesto in
 * AGENTS.md and the validators in src/lib/shared/anti-slop.ts.
 */

import type { EmailMessage } from "./client";

export interface WeeklyEmailContext {
  to: string;
  displayName: string | null;
  formUrl: string;
  /** Monday of the current ISO week. Used as the idempotency key suffix. */
  weekStart: string;
}

function greeting(displayName: string | null): string {
  const name = displayName?.trim();
  return name ? `Hey ${name}` : "Hey";
}

export function buildWeeklySendEmail(ctx: WeeklyEmailContext): EmailMessage {
  // Copy mirrors the GHL "Off&On - Your Weekly Check In" email, minus the
  // book-your-call line (the bot doesn't handle call booking).
  const subject = "Off&On - Your Weekly Check In";
  const text = [
    "Your weekly check in is live. Go fill it in now.",
    "",
    ctx.formUrl,
    "",
    "Alex",
  ].join("\n");

  const html = [
    "<p>Your weekly check in is live. Go fill it in now.</p>",
    `<p><a href="${ctx.formUrl}">Check-In</a></p>`,
    "<p>Alex</p>",
  ].join("");

  return {
    to: ctx.to,
    subject,
    html,
    text,
    idempotencyKey: `weekly-send-${ctx.weekStart}-${ctx.to}`,
  };
}

export function buildWeeklyReminderEmail(ctx: WeeklyEmailContext): EmailMessage {
  const hi = greeting(ctx.displayName);
  const subject = "Reminder: your Off&On weekly check-in";
  const text = [
    `${hi},`,
    "",
    "Friendly nudge. You haven't filled in this week's check-in yet.",
    "",
    "Takes 10 minutes. Your scripts next week are written off what you put here.",
    "",
    ctx.formUrl,
    "",
    "Off&On",
  ].join("\n");

  const html = [
    `<p>${hi},</p>`,
    "<p>Friendly nudge. You haven't filled in this week's check-in yet.</p>",
    "<p>Takes 10 minutes. Your scripts next week are written off what you put here.</p>",
    `<p><a href="${ctx.formUrl}">Open this week's check-in</a></p>`,
    "<p>Off&amp;On</p>",
  ].join("");

  return {
    to: ctx.to,
    subject,
    html,
    text,
    idempotencyKey: `weekly-reminder-${ctx.weekStart}-${ctx.to}`,
  };
}
