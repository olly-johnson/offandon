import {
  dispatchWeekly,
  getWeekSubmitters,
  listRecipients,
} from "@/engines/weekly-checkin";
import { getEmailClient } from "@/lib/shared/email";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { isoWeekStart } from "@/lib/shared/week";

import { inngest } from "../client";

const log = createLogger("inngest.weekly-checkin-reminder");

/**
 * Saturday 09:00 Bali (UTC+8) = Saturday 01:00 UTC. Sends a reminder to
 * everyone who DIDN'T submit a check-in for the current week. The week
 * anchor is the Monday of THIS Saturday — same ISO week as Friday's
 * send, so submitters mid-week are correctly excluded.
 */
export const weeklyCheckinReminder = inngest.createFunction(
  {
    id: "weekly-checkin-reminder",
    name: "Weekly check-in: Saturday reminder",
    retries: 2,
    triggers: [{ cron: "0 1 * * 6" }],
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

    // step.run results must be JSON-serialisable; convert the Set to an
    // array across the step boundary and rehydrate locally.
    const submittedIds = await step.run("list-submitters", async () =>
      Array.from(await getWeekSubmitters(supabase, weekStart)),
    );
    const submitted = new Set(submittedIds);

    const pending = recipients.filter((r) => !submitted.has(r.userId));

    log.info("reminder cohort built", {
      week_start: weekStart,
      total: recipients.length,
      submitted: submitted.size,
      pending: pending.length,
    });

    const result = await step.run("dispatch", () =>
      dispatchWeekly({
        email,
        recipients: pending,
        formUrl,
        weekStart,
        kind: "reminder",
      }),
    );

    return {
      week_start: weekStart,
      total: recipients.length,
      submitted_count: submitted.size,
      ...result,
    };
  },
);
