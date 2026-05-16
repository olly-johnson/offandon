import { dispatchWeekly, listRecipients } from "@/engines/weekly-checkin";
import { getEmailClient } from "@/lib/shared/email";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { isoWeekStart } from "@/lib/shared/week";

import { inngest } from "../client";

const log = createLogger("inngest.weekly-checkin-send");

/**
 * Friday 09:00 Bali (UTC+8) = Friday 01:00 UTC. Sends the weekly
 * check-in invitation to every active, non-admin profile with a real
 * email address. Idempotency-Key on the Resend call is
 * `weekly-send-<week_start>-<email>`, so a re-run of the same week
 * inside Resend's dedupe window is a no-op rather than a second mail.
 *
 * The function does NOT wait for or branch on whether anyone has
 * already submitted; the Friday send is always to the full cohort.
 * The Saturday reminder is what filters submitters out.
 */
export const weeklyCheckinSend = inngest.createFunction(
  {
    id: "weekly-checkin-send",
    name: "Weekly check-in: Friday send",
    retries: 2,
    triggers: [{ cron: "0 1 * * 5" }],
  },
  async ({ step }) => {
    const formUrl = process.env.WEEKLY_CHECKIN_FORM_URL;
    if (!formUrl) {
      log.warn("WEEKLY_CHECKIN_FORM_URL unset; nothing to send");
      return { skipped: true };
    }

    const supabase = createSupabaseAdminClient();
    const email = getEmailClient();
    const weekStart = isoWeekStart(new Date());

    const recipients = await step.run("list-recipients", () =>
      listRecipients(supabase),
    );

    const result = await step.run("dispatch", () =>
      dispatchWeekly({
        email,
        recipients,
        formUrl,
        weekStart,
        kind: "send",
      }),
    );

    log.info("weekly send complete", { week_start: weekStart, ...result });
    return { week_start: weekStart, ...result };
  },
);
