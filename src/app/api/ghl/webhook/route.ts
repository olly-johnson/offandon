import type { NextRequest } from "next/server";

import {
  extractCheckinMetrics,
  GhlCheckinParseError,
  parseGhlCheckinBody,
  saveCheckin,
  verifyGhlWebhookSecret,
} from "@/engines/weekly-checkin";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { isoWeekStart } from "@/lib/shared/week";

const log = createLogger("api.ghl.webhook");

const SECRET_HEADER = "x-ghl-webhook-secret";

/**
 * Receives weekly check-in submissions from GoHighLevel ("Hookd").
 *
 * Wire shape: the GHL *Survey Submitted* workflow (survey "Off&On Weekly
 * Check-In") has a Webhook action that POSTs the survey answers + the
 * contact email here, with a static shared secret in X-Ghl-Webhook-Secret.
 * We verify the secret, parse the payload, resolve the Bot OS user by
 * email, persist the check-in idempotently, and emit the Voice DNA
 * refresh. This replaces the bot's own Google-Form/Resend check-in loop.
 *
 * Outcomes:
 *   200 ok=true                     row inserted, voice refresh emitted
 *   200 ok=true duplicated=true     same (user, week) already exists; no-op.
 *                                   200 keeps GHL from retrying.
 *   400                             body unparseable / no matching user
 *   401                             bad or missing secret
 *   500                             environment misconfigured
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    log.error("GHL_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const provided = request.headers.get(SECRET_HEADER);
  if (!verifyGhlWebhookSecret(secret, provided)) {
    log.warn("ghl webhook secret mismatch", { had_header: provided != null });
    return Response.json({ ok: false, error: "bad secret" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseGhlCheckinBody(rawBody);
  } catch (err) {
    const msg =
      err instanceof GhlCheckinParseError ? err.message : (err as Error).message;
    log.warn("ghl payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Resolve user by email. Same listUsers approach as the weekly-checkin
  // webhook; fine for the current cohort. Switch to an auth.users index
  // query if the cohort grows past ~1000.
  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    log.error("listUsers failed", { error: usersRes.error.message });
    return Response.json(
      { ok: false, error: "user lookup failed" },
      { status: 500 },
    );
  }
  const user = usersRes.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === payload.email,
  );
  if (!user) {
    log.warn("no user for ghl respondent", { email: payload.email });
    return Response.json({ ok: false, error: "unknown respondent" }, { status: 400 });
  }

  const submittedAt = payload.submittedAt
    ? new Date(payload.submittedAt)
    : new Date();
  const weekStart = isoWeekStart(submittedAt);

  const { row, duplicated } = await saveCheckin(supabase, {
    userId: user.id,
    weekStart,
    rawResponses: payload.answers,
    submittedAt: submittedAt.toISOString(),
    metrics: extractCheckinMetrics(payload.answers),
  });

  if (duplicated) {
    log.info("duplicate ghl submission ignored", {
      user_id: user.id,
      week_start: weekStart,
    });
    return Response.json({ ok: true, duplicated: true });
  }

  await inngest.send({
    name: INNGEST_EVENTS.VoiceDnaRefreshRequested,
    data: { user_id: user.id, week_start: weekStart },
  });

  log.info("ghl checkin saved + refresh emitted", {
    user_id: user.id,
    week_start: weekStart,
    row_id: row?.id,
  });

  return Response.json({ ok: true, duplicated: false, id: row?.id ?? null });
}
