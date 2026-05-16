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
  const hi = greeting(ctx.displayName);
  const subject = "Your Off&On weekly check-in is open";
  const text = [
    `${hi},`,
    "",
    "Quick 10-15 minute check-in. Your wins, what you posted, what landed, what you're focused on next week.",
    "",
    "This feeds your bot. The more specific you are, the smarter your scripts get next week.",
    "",
    ctx.formUrl,
    "",
    "Off&On",
  ].join("\n");

  const html = [
    `<p>${hi},</p>`,
    "<p>Quick 10-15 minute check-in. Your wins, what you posted, what landed, what you're focused on next week.</p>",
    "<p>This feeds your bot. The more specific you are, the smarter your scripts get next week.</p>",
    `<p><a href="${ctx.formUrl}">Open this week's check-in</a></p>`,
    "<p>Off&amp;On</p>",
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
