/**
 * Fathom ingestion engine types (BO-061).
 *
 * Two payload shapes flow through the engine:
 *
 *  - FathomWebhookPayload   the minimal subset we parse from the webhook
 *                           POST body. Required fields are limited to what's
 *                           needed to identify the recording and the user;
 *                           the full transcript is fetched separately via
 *                           the Fathom REST API so we don't depend on
 *                           Fathom's webhook payload always including the
 *                           full plaintext.
 *
 *  - FathomRecording        the canonical representation after the API
 *                           round-trip. Carries the full transcript + any
 *                           summary text so the ingester can build a single
 *                           rich client_documents row.
 */

export interface FathomInvitee {
  email: string;
  name?: string | null;
}

export interface FathomWebhookPayload {
  /** Unique recording id from Fathom. Stable across replays of the same call. */
  recordingId: string;
  /** Human title set by the recorder (meeting subject). */
  title: string;
  /** ISO timestamp the call started. */
  startedAt: string;
  /** Everyone on the call, including the operator. Used to resolve the client. */
  invitees: FathomInvitee[];
  /**
   * Optional plaintext transcript when Fathom includes it on the wire. If
   * absent, the ingester falls back to FathomApiClient.getRecording().
   */
  transcriptPlaintext?: string;
  /** Optional shareable URL pointing to the Fathom recording page. */
  shareUrl?: string;
}

export interface FathomRecording {
  recordingId: string;
  title: string;
  startedAt: string;
  durationSeconds?: number;
  invitees: FathomInvitee[];
  transcriptPlaintext: string;
  shareUrl?: string;
  summary?: string;
}

export interface IFathomClient {
  /**
   * Fetch a full recording including transcript by id. Implementations
   * MUST throw on non-2xx or empty transcript so the ingester can fail the
   * Inngest step and retry.
   */
  getRecording(recordingId: string): Promise<FathomRecording>;
}
