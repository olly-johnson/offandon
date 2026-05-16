/**
 * Email dispatch orchestrator for the weekly check-in crons.
 *
 * Splitting this off the Inngest function so it can be unit-tested
 * without Inngest's step-runner. The function layer is a thin wrapper:
 * resolve recipients, optionally filter, call dispatch, count outcomes.
 *
 * Errors per recipient are swallowed and counted; the Inngest function
 * decides whether the run is "ok". Returning per-recipient errors keeps
 * a single mailer 4xx from killing the rest of the cohort.
 */

import { createLogger } from "@/lib/shared/logger";
import {
  buildWeeklyReminderEmail,
  buildWeeklySendEmail,
  type IEmailClient,
} from "@/lib/shared/email";

import type { Recipient } from "./types";

const log = createLogger("weekly-checkin.dispatch");

export type DispatchKind = "send" | "reminder";

export interface DispatchInput {
  email: IEmailClient;
  recipients: Recipient[];
  formUrl: string;
  weekStart: string;
  kind: DispatchKind;
}

export interface DispatchResult {
  attempted: number;
  ok: number;
  failed: number;
  failures: Array<{ to: string; error: string }>;
}

export async function dispatchWeekly(
  input: DispatchInput,
): Promise<DispatchResult> {
  const builder =
    input.kind === "send" ? buildWeeklySendEmail : buildWeeklyReminderEmail;

  const failures: DispatchResult["failures"] = [];
  let ok = 0;

  for (const recipient of input.recipients) {
    const message = builder({
      to: recipient.email,
      displayName: recipient.displayName,
      formUrl: input.formUrl,
      weekStart: input.weekStart,
    });
    const result = await input.email.send(message);
    if (result.ok) {
      ok += 1;
    } else {
      failures.push({
        to: recipient.email,
        error: result.error ?? "unknown",
      });
    }
  }

  log.info("dispatch complete", {
    kind: input.kind,
    week_start: input.weekStart,
    attempted: input.recipients.length,
    ok,
    failed: failures.length,
  });

  return {
    attempted: input.recipients.length,
    ok,
    failed: failures.length,
    failures,
  };
}
