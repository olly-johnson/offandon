import type { NextRequest } from "next/server";

import {
  ingestFathomRecording,
  loadAuthUserEmailIndex,
  parseWebhookBody,
  resolveAttendees,
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
 * Routing rule: every attendee on the call (calendar_invitees + recorded_by)
 * is resolved against auth.users.email AND public.fathom_email_aliases.
 * The recording is ingested once per matched user, so the operator and
 * every client with a site account all get the transcript on their
 * /transcripts page. Each user gets their own row in client_documents,
 * sharing source_path (`fathom://<recording_id>`), so re-runs overwrite
 * cleanly per user.
 *
 * Ingestion is synchronous: parse, resolve attendees, then chunk and
 * embed once per matched user. We re-embed per ingest for code
 * simplicity (Voyage cost is small at our volume).
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

  const supabase = createSupabaseAdminClient();
  const emailIndex = await loadAuthUserEmailIndex(supabase);
  const resolution = await resolveAttendees(supabase, emailIndex, recording);

  if (resolution.matched.length === 0) {
    log.info("no site users matched recording attendees", {
      recording_id: recording.recordingId,
      unmatched: resolution.unmatchedEmails,
    });
    return Response.json({
      ok: true,
      skipped: true,
      reason: "no matched attendees",
      unmatched_emails: resolution.unmatchedEmails,
    });
  }

  const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });
  const ingested: Array<{ user_id: string; document_id: string; chunk_count: number }> = [];
  for (const attendee of resolution.matched) {
    const result = await ingestFathomRecording(
      { supabase, embeddings },
      { userId: attendee.userId, recording },
    );
    ingested.push({
      user_id: attendee.userId,
      document_id: result.documentId,
      chunk_count: result.chunkCount,
    });
  }

  log.info("fathom recording ingested via webhook", {
    recording_id: recording.recordingId,
    matched_count: ingested.length,
    unmatched_count: resolution.unmatchedEmails.length,
  });

  return Response.json({
    ok: true,
    recording_id: recording.recordingId,
    ingested,
    unmatched_emails: resolution.unmatchedEmails,
  });
}
