import type { NextRequest } from "next/server";

import {
  parseWebhookBody,
  pickClientInvitee,
  verifyHmac,
  WebhookParseError,
} from "@/engines/fathom";
import { inngest, INNGEST_EVENTS } from "@/lib/shared/inngest/client";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

const log = createLogger("api.fathom.webhook");

const SIGNATURE_HEADER = "x-fathom-signature";

/**
 * Receives Fathom webhook calls for completed recordings.
 *
 * Verification: HMAC-SHA256 over the raw request body using
 * FATHOM_WEBHOOK_SECRET. The X-Fathom-Signature header carries the digest
 * prefixed with `sha256=`; the prefix is optional on the wire.
 *
 * Mapping rule: the webhook tells us WHICH recording is ready; we resolve
 * the client by intersecting the invitee list with our user table,
 * skipping anyone listed in FATHOM_OPERATOR_EMAILS. The matching invitee
 * email is looked up in auth.users (mirrors the weekly-checkin pattern).
 *
 * On success we emit fathom/recording.received and return 200. The
 * Inngest function does the heavy work: fetches full transcript via
 * Fathom's REST API, chunks + embeds, persists to client_documents.
 *
 * Status codes:
 *   200 ok=true                ingest event emitted
 *   200 ok=true skipped=true    payload valid but no matching user; nothing to do
 *   400                          unparseable body
 *   401                          bad or missing HMAC signature
 *   500                          environment not configured
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    log.error("FATHOM_WEBHOOK_SECRET unset; rejecting all calls");
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

  const operatorEmails = (process.env.FATHOM_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const client = pickClientInvitee(payload.invitees, operatorEmails);
  if (!client) {
    log.warn("no non-operator invitee on recording", {
      recording_id: payload.recordingId,
      invitee_count: payload.invitees.length,
    });
    return Response.json({ ok: true, skipped: true, reason: "no client invitee" });
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
  const user = usersRes.data.users.find(
    (u) => (u.email ?? "").toLowerCase() === client.email,
  );
  if (!user) {
    log.info("no user for fathom invitee; skipping", {
      recording_id: payload.recordingId,
      email: client.email,
    });
    return Response.json({ ok: true, skipped: true, reason: "unknown invitee" });
  }

  await inngest.send({
    name: INNGEST_EVENTS.FathomRecordingReceived,
    data: {
      user_id: user.id,
      recording_id: payload.recordingId,
      started_at: payload.startedAt,
      share_url: payload.shareUrl,
    },
  });

  log.info("fathom event emitted", {
    user_id: user.id,
    recording_id: payload.recordingId,
  });

  return Response.json({ ok: true, recording_id: payload.recordingId });
}
