import type { NextRequest } from "next/server";

import {
  ingestFathomRecording,
  parseWebhookBody,
  pickClientInvitee,
  verifyHmac,
  WebhookParseError,
} from "@/engines/fathom";
import { VoyageEmbeddingsClient } from "@/lib/shared/embeddings";
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
 * Mapping rule: Fathom's payload includes a structured transcript and
 * calendar_invitees list. We resolve the client by:
 *   1. preferring an invitee with is_external = true (the cleanest signal),
 *   2. otherwise dropping FATHOM_OPERATOR_EMAILS and taking the first remaining,
 * then looking up the resulting email in auth.users.
 *
 * Ingestion is synchronous: parse -> flatten transcript -> chunk + Voyage
 * embed -> upsert into client_documents / client_document_chunks. Idempotent
 * by source_path = `fathom://<recording_id>`.
 *
 * Status codes:
 *   200 ok=true                    ingested
 *   200 ok=true skipped=true       payload valid but no matching user / no transcript
 *   400                            unparseable body
 *   401                            bad or missing HMAC signature
 *   500                            environment not configured
 */
export async function POST(request: NextRequest): Promise<Response> {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    log.error("FATHOM_WEBHOOK_SECRET unset; rejecting all calls");
    return Response.json({ ok: false, error: "not configured" }, { status: 500 });
  }
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    log.error("VOYAGE_API_KEY unset; cannot embed Fathom transcripts");
    return Response.json(
      { ok: false, error: "embeddings not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);
  if (!verifyHmac(secret, rawBody, signature)) {
    log.warn("hmac mismatch", { had_header: signature != null });
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let recording;
  try {
    recording = parseWebhookBody(rawBody);
  } catch (err) {
    const msg =
      err instanceof WebhookParseError ? err.message : (err as Error).message;
    log.warn("payload parse error", { error: msg });
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }

  if (recording.transcriptPlaintext.trim().length === 0) {
    log.info("recording arrived without a transcript; skipping", {
      recording_id: recording.recordingId,
    });
    return Response.json({ ok: true, skipped: true, reason: "no transcript" });
  }

  const operatorEmails = (process.env.FATHOM_OPERATOR_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const client = pickClientInvitee(recording.invitees, operatorEmails);
  if (!client) {
    log.warn("no client invitee on recording", {
      recording_id: recording.recordingId,
      invitee_count: recording.invitees.length,
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
      recording_id: recording.recordingId,
      email: client.email,
    });
    return Response.json({ ok: true, skipped: true, reason: "unknown invitee" });
  }

  const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });
  const result = await ingestFathomRecording(
    { supabase, embeddings },
    { userId: user.id, recording },
  );

  log.info("fathom recording ingested via webhook", {
    user_id: user.id,
    recording_id: recording.recordingId,
    document_id: result.documentId,
    chunk_count: result.chunkCount,
  });

  return Response.json({
    ok: true,
    recording_id: recording.recordingId,
    document_id: result.documentId,
    chunk_count: result.chunkCount,
  });
}
