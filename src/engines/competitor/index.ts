export {
  addCompetitor,
  COMPETITOR_LIMIT_PER_USER,
  CompetitorLimitError,
  DuplicateCompetitorError,
  InvalidCompetitorHandleError,
  listCompetitors,
  normaliseHandle,
  removeCompetitor,
} from "./persistence";
export type {
  CompetitorRow,
  CompetitorSupabaseClient,
} from "./persistence";

export {
  listMediaForCompetitor,
  updateCompetitorSyncState,
  upsertCompetitorMedia,
} from "./media-persistence";
export type { CompetitorMediaRow } from "./media-persistence";

export {
  ApifyConfigError,
  ApifyCompetitorScraper,
  buildReelScraperInput,
  loadApifyConfig,
  parseReelItem,
} from "./scraper";
export type {
  ApifyConfig,
  CompetitorReel,
} from "./scraper";

export {
  ApifyWebhookParseError,
  parseApifyWebhookBody,
  verifyApifyWebhookToken,
} from "./webhook";
export type { ApifyWebhookPayload } from "./webhook";
