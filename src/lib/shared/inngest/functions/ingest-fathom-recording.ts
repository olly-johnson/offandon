import {
  FathomApiClient,
  ingestFathomRecording,
} from "@/engines/fathom";
import { VoyageEmbeddingsClient } from "@/lib/shared/embeddings";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import {
  inngest,
  INNGEST_EVENTS,
  type FathomRecordingReceivedData,
} from "../client";

const log = createLogger("inngest.ingest-fathom-recording");

/**
 * fathom/recording.received handler (BO-061).
 *
 * Triggered by the Fathom webhook once we've identified the user. Fetches
 * the full recording (transcript + summary) via the Fathom REST API,
 * chunks + embeds it, and writes to client_documents + chunks. Idempotent
 * by source_path `fathom://<recording_id>` so retries (Inngest backoff or
 * a manual replay) overwrite cleanly rather than duplicating.
 *
 * Per-recording concurrency 1: same recording_id from two near-simultaneous
 * webhook fires won't race the upsert. Fathom rarely retries quickly
 * enough for this to matter, but the guard is cheap.
 *
 * Fail-closed: if either FATHOM_API_KEY or VOYAGE_API_KEY is unset the
 * function logs + returns skipped rather than throwing — same pattern as
 * the weekly-checkin send when WEEKLY_CHECKIN_FORM_URL is unset.
 */
export const ingestFathomRecordingFn = inngest.createFunction(
  {
    id: "ingest-fathom-recording",
    name: "Fathom: ingest completed recording",
    retries: 3,
    concurrency: { key: "event.data.recording_id", limit: 1 },
    triggers: [{ event: INNGEST_EVENTS.FathomRecordingReceived }],
  },
  async ({ event, step }) => {
    const { user_id: userId, recording_id: recordingId } =
      event.data as FathomRecordingReceivedData;

    const apiKey = process.env.FATHOM_API_KEY;
    const voyageKey = process.env.VOYAGE_API_KEY;
    if (!apiKey || !voyageKey) {
      log.warn("fathom or voyage api key unset; skipping ingestion", {
        recording_id: recordingId,
        has_fathom: !!apiKey,
        has_voyage: !!voyageKey,
      });
      return { skipped: true, reason: "missing api keys" };
    }

    const supabase = createSupabaseAdminClient();
    const fathom = new FathomApiClient({ apiKey });
    const embeddings = new VoyageEmbeddingsClient({ apiKey: voyageKey });

    const recording = await step.run("fetch-recording", () =>
      fathom.getRecording(recordingId),
    );

    const result = await step.run("ingest", () =>
      ingestFathomRecording(
        { supabase, embeddings },
        { userId, recording },
      ),
    );

    log.info("fathom recording ingested via inngest", {
      user_id: userId,
      recording_id: recordingId,
      document_id: result.documentId,
      chunk_count: result.chunkCount,
    });

    return {
      user_id: userId,
      recording_id: recordingId,
      document_id: result.documentId,
      chunk_count: result.chunkCount,
    };
  },
);
