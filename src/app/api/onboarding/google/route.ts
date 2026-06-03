import type { NextRequest } from "next/server";

import {
  parseWebhookBody,
  verifyHmac,
  WebhookParseError,
} from "@/engines/weekly-checkin";
import {
  inngest,
  INNGEST_EVENTS,
} from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

const log = createLogger("api.onboarding.google");

const SIGNATURE_HEADER = "x-off-on-signature";

/**
 * Onboarding intake from the Google "Identity Foundation" form (BO-081).
 *
 * Wire shape is the same HMAC-signed Apps Script POST the weekly check-in
 * uses ({ respondentEmail, submittedAt, answers }). We resolve the user by
 * email (creating + inviting them if new), then emit
 * onboarding/identity.submitted so the Inngest worker generates their Voice
 * DNA from the answers. Heavy LLM work is deliberately off the request path.
 *
 *   200 ok created=true|false   accepted; generation queued
 *   400                         body unparseable
 *   401                         bad or missing signature
 *   500                         env misconfigured / user lookup or invite failed
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.ONBOARDING_WEBHOOK_SECRET;
  if (!secret) {
    log.error("ONBOARDING_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!verifyHmac(secret, rawBody, signature)) {
    log.warn("onboarding hmac mismatch", { had_header: signature != null });
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = parseWebhookBody(rawBody);
  } catch (err) {
    const msg =
      err instanceof WebhookParseError ? err.message : (err as Error).message;
    log.warn("onboarding payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const usersRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (usersRes.error) {
    log.error("listUsers failed", { error: usersRes.error.message });
    return Response.json(
      { ok: false, error: "user lookup failed" },
      { status: 500 },
    );
  }

  let user = usersRes.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === payload.respondentEmail,
  );
  let created = false;

  if (!user) {
    // New client: create the account and send the set-password/login email.
    const invite = await supabase.auth.admin.inviteUserByEmail(
      payload.respondentEmail,
    );
    if (invite.error || !invite.data.user) {
      log.error("inviteUserByEmail failed", {
        email: payload.respondentEmail,
        error: invite.error?.message,
      });
      return Response.json(
        { ok: false, error: "could not create user" },
        { status: 500 },
      );
    }
    user = invite.data.user;
    created = true;
  }

  await inngest.send({
    name: INNGEST_EVENTS.OnboardingIdentitySubmitted,
    data: {
      user_id: user.id,
      email: payload.respondentEmail,
      answers: payload.answers,
      submitted_at: payload.submittedAt,
    },
  });

  log.info("onboarding submission accepted", {
    user_id: user.id,
    email: payload.respondentEmail,
    created,
    answer_count: Object.keys(payload.answers).length,
  });

  return Response.json({ ok: true, created });
}
