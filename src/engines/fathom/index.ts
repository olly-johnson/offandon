export type {
  FathomInvitee,
  FathomMeetingsPage,
  FathomRecording,
  FathomTranscriptTurn,
  FathomWebhookPayload,
  IFathomClient,
} from "./types";

export {
  flattenTranscript,
  normaliseRecording,
  parseWebhookBody,
  signBody,
  verifyHmac,
  WebhookParseError,
} from "./webhook";

export {
  collectAttendeeEmails,
  loadAuthUserEmailIndex,
  resolveAttendees,
  type AttendeeResolution,
  type ResolvedAttendee,
} from "./mapping";

export {
  FathomApiClient,
  FATHOM_API_BASE_URL,
  type FathomApiClientOptions,
} from "./client";

export {
  buildIngestBody,
  fathomSourcePath,
  ingestFathomRecording,
  FATHOM_SOURCE_PATH_PREFIX,
  type IngestFathomArgs,
  type IngestFathomDeps,
  type IngestFathomResult,
} from "./ingest";
