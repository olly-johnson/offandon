import { Inngest } from "inngest";

/**
 * Single Inngest client for the whole app. Functions register against this;
 * the serve endpoint at /api/inngest exposes them; server actions emit events.
 *
 * Local dev: run `npx inngest-cli@latest dev` in a separate terminal.
 *   The CLI auto-discovers /api/inngest on http://localhost:3000 and routes
 *   events without needing INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY.
 *
 * Production: requires INNGEST_EVENT_KEY (auto-picked up by the SDK from env)
 * and INNGEST_SIGNING_KEY (used by the serve endpoint to verify incoming
 * webhook calls from Inngest's cloud).
 */
export const inngest = new Inngest({
  id: "bot-os",
});

/**
 * Strongly-typed event names. Single source of truth so producers (server
 * actions) and consumers (functions) cannot drift on the string.
 */
export const INNGEST_EVENTS = {
  ScriptsBatchRequested: "scripts/batch.requested",
  MediaAnalyzeRequested: "research/media.analyze.requested",
  VoiceDnaRefreshRequested: "voice/dna.refresh.requested",
  CompetitorScrapeRequested: "competitor/scrape.requested",
  CompetitorScrapeCompleted: "competitor/scrape.completed",
  CompetitorMediaAnalyzeRequested: "competitor/media.analyze.requested",
  YoutubeMediaDownloadRequested:
    "competitor/youtube-media.download.requested",
  SuggestedAvatarsRefreshRequested:
    "research/suggested-avatars.refresh.requested",
  OnboardingIdentitySubmitted: "onboarding/identity.submitted",
} as const;

/**
 * Payload shape for onboarding/identity.submitted (BO-081). Emitted by the
 * Google-Form onboarding webhook once the user is resolved/created. The
 * function turns the answers into a source document, LLM-extracts the full
 * Voice DNA (reusing the ingestion extractor), commits it, and tags the GHL
 * contact onboarding_complete.
 */
export interface OnboardingIdentitySubmittedData {
  user_id: string;
  email: string;
  /** Raw form answers keyed by question title. */
  answers: Record<string, string>;
  /** ISO submission timestamp. */
  submitted_at: string;
}

/**
 * Payload shape for scripts/batch.requested. The function loads the rest
 * (voice DNA, count) from the script_batches row referenced by batch_id;
 * we keep the event payload deliberately small.
 */
export interface ScriptsBatchRequestedData {
  batch_id: string;
  user_id: string;
}

/**
 * Payload shape for research/media.analyze.requested (BO-043). The
 * function looks up the media row + voice_dna + library stats by
 * (user_id, media_id) so we don't need to pre-resolve them at emit
 * time. force=true bypasses the cached-analysis short-circuit.
 */
export interface MediaAnalyzeRequestedData {
  user_id: string;
  media_id: string;
  force?: boolean;
}

/**
 * Payload shape for voice/dna.refresh.requested (BO-060). Emitted by the
 * weekly check-in webhook after a successful insert. The function reads
 * the latest onboarding answers + accumulated weekly_checkins for the
 * user and regenerates their active Voice DNA row.
 */
export interface VoiceDnaRefreshRequestedData {
  user_id: string;
  /** week_start of the check-in that triggered the refresh. Telemetry only. */
  week_start?: string;
}

/**
 * Payload shape for competitor/scrape.requested (BO-062). Emitted by the
 * "Sync now" server action on /research. The function loads the
 * competitor_accounts row by (id, user_id), starts an Apify reel scraper
 * run with our webhook URL, and stamps last_synced_at = null /
 * last_sync_error = null while in flight.
 */
export interface CompetitorScrapeRequestedData {
  competitor_id: string;
  user_id: string;
}

/**
 * Payload shape for competitor/scrape.completed (BO-062). Emitted by
 * /api/apify/webhook once the Apify actor run finishes. The function
 * fetches the resulting dataset, upserts to competitor_media, and
 * touches the competitor row's sync stamps.
 */
export interface CompetitorScrapeCompletedData {
  competitor_id: string;
  user_id: string;
  actor_run_id: string;
  dataset_id: string;
  succeeded: boolean;
  status: string;
}

/**
 * Payload shape for competitor/media.analyze.requested (BO-063). The
 * worker loads the competitor_media row + voice_dna by (user_id,
 * media_id), runs Deepgram + Sonnet, and writes one
 * competitor_media_analysis row. Force=true bypasses the cached short-
 * circuit; matches the analyze-media pattern from BO-043.
 */
export interface CompetitorMediaAnalyzeRequestedData {
  user_id: string;
  competitor_id: string;
  media_id: string;
  force?: boolean;
}

/**
 * Payload shape for competitor/youtube-media.download.requested. The
 * list scraper (streamers~youtube-scraper) returns watch-page URLs;
 * this worker resolves each one to a stable mp4 URL via the YT
 * downloader actor, writes it back to competitor_media.media_url,
 * and then emits the regular analyse event so the rest of the chain
 * is platform-agnostic.
 */
export interface YoutubeMediaDownloadRequestedData {
  user_id: string;
  competitor_id: string;
  media_id: string;
}
