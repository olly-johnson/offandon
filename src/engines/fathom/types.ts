/**
 * Fathom ingestion engine types (BO-061).
 *
 * Fathom's REST API and webhook payloads share the same meeting shape:
 *
 *   {
 *     recording_id: 123456,
 *     title: "Coaching call",
 *     recording_start_time: "2026-05-17T15:00:00Z",
 *     calendar_invitees: [
 *       { name, email, email_domain, is_external, ... },
 *     ],
 *     recorded_by: { name, email, email_domain, ... },
 *     transcript: [
 *       { speaker: { display_name, matched_calendar_invitee_email }, text, timestamp },
 *       ...
 *     ],
 *     share_url: "https://fathom.video/share/...",
 *     default_summary?: string | null,
 *     ...
 *   }
 *
 * FathomTranscriptTurn captures one speaker turn. FathomRecording is the
 * normalised shape the rest of the engine consumes — invitees pre-cleaned,
 * `transcriptPlaintext` produced via flattenTranscript().
 */

export interface FathomInvitee {
  email: string;
  name?: string | null;
  /** True when the invitee is from outside the recorder's team (typically the client). */
  isExternal?: boolean;
}

export interface FathomTranscriptTurn {
  speaker: string;
  speakerEmail: string | null;
  text: string;
  timestamp: string;
}

export interface FathomRecording {
  recordingId: string;
  title: string;
  startedAt: string;
  durationSeconds?: number;
  invitees: FathomInvitee[];
  /** Email of the operator who recorded the call. Useful for filtering clients. */
  recordedByEmail?: string | null;
  transcript: FathomTranscriptTurn[];
  /** Flattened "Speaker Name: text" lines joined by newline. */
  transcriptPlaintext: string;
  shareUrl?: string;
  summary?: string | null;
}

export type FathomWebhookPayload = FathomRecording;

export interface FathomMeetingsPage {
  items: FathomRecording[];
  nextCursor: string | null;
}

export interface IFathomClient {
  /**
   * Paginated list of meetings, newest first. Pass the previous response's
   * nextCursor to get the next page; null cursor returns the first page.
   * Implementations MUST throw on non-2xx responses.
   */
  listMeetings(opts?: { limit?: number; cursor?: string | null }): Promise<FathomMeetingsPage>;
}
