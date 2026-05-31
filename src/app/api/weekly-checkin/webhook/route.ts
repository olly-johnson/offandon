import type { NextRequest } from "next/server";

import {
  extractCheckinMetrics,
  parseWebhookBody,
  saveCheckin,
  verifyHmac,
  WebhookParseError,
} from "@/engines/weekly-checkin";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { isoWeekStart } from "@/lib/shared/week";

const log = createLogger("api.weekly-checkin.webhook");

const SIGNATURE_HEADER = "x-off-on-signature";

/**
 * Receives Google Forms submissions for the weekly check-in.
 *
 * Wire shape: the Apps Script template at examples/google_form_webhook.gs
 * fires onFormSubmit, builds a JSON payload of the form
 *
 *   { respondentEmail, submittedAt, answers: { "<question title>": "value" } }
 *
 * signs it with HMAC-SHA256 using WEEKLY_CHECKIN_WEBHOOK_SECRET, and
 * POSTs to this route with the hex digest in X-Off-On-Signature.
 *
 * Outcomes:
 *   200 ok=true                     row inserted, voice refresh emitted
 *   200 ok=true duplicated=true     same (user, week) already exists; nothing done.
 *                                   Returns 200 to keep Apps Script from retrying.
 *   400                             body unparseable / no matching user
 *   401                             bad or missing HMAC
 *   500                             environment misconfigured
 *
 * Everything not 200 short-circuits before the DB write to keep the
 * surface noisy-but-honest if someone probes the endpoint.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.WEEKLY_CHECKIN_WEBHOOK_SECRET;
  if (!secret) {
    log.error("WEEKLY_CHECKIN_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!verifyHmac(secret, rawBody, signature)) {
    log.warn("hmac mismatch", { had_header: signature != null });
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseWebhookBody(rawBody);
  } catch (err) {
    const msg =
      err instanceof WebhookParseError ? err.message : (err as Error).message;
    log.warn("payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Resolve user by email. listUsers is unfortunate at scale; works fine
  // for the current cohort and matches the engines/admin/stats pattern.
  // If the cohort grows past ~1000 we'll switch to an auth.users index
  // query via SQL.
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    log.error("listUsers failed", { error: usersRes.error.message });
    return Response.json(
      { ok: false, error: "user lookup failed" },
      { status: 500 },
    );
  }
  const user = usersRes.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === payload.respondentEmail,
  );
  if (!user) {
    log.warn("no user for respondent", { email: payload.respondentEmail });
    return Response.json({ ok: false, error: "unknown respondent" }, { status: 400 });
  }

  const submittedAt = new Date(payload.submittedAt);
  const weekStart = isoWeekStart(submittedAt);

  const { row, duplicated } = await saveCheckin(supabase, {
    userId: user.id,
    weekStart,
    rawResponses: payload.answers,
    submittedAt: submittedAt.toISOString(),
    metrics: extractCheckinMetrics(payload.answers),
  });

  if (duplicated) {
    log.info("duplicate submission ignored", {
      user_id: user.id,
      week_start: weekStart,
    });
    return Response.json({ ok: true, duplicated: true });
  }

  await inngest.send({
    name: INNGEST_EVENTS.VoiceDnaRefreshRequested,
    data: { user_id: user.id, week_start: weekStart },
  });

  log.info("checkin saved + refresh emitted", {
    user_id: user.id,
    week_start: weekStart,
    row_id: row?.id,
  });

  return Response.json({ ok: true, duplicated: false, id: row?.id ?? null });
}
