export {
  addCompetitor,
  COMPETITOR_LIMIT_PER_USER,
  CompetitorLimitError,
  DuplicateCompetitorError,
  getCompetitorForUser,
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
  getCompetitorMediaForUser,
  listMediaForCompetitor,
  markCompetitorMediaAnalysisPending,
  setCompetitorMediaAnalysisFailure,
  updateCompetitorSyncState,
  upsertCompetitorMedia,
} from "./media-persistence";
export type { CompetitorMediaRow } from "./media-persistence";

export {
  getAnalysesForCompetitorMediaIds,
  getAnalysisForCompetitorMedia,
  saveCompetitorAnalysis,
} from "./analysis-persistence";
export type {
  CompetitorAnalysisSupabaseClient,
  SaveCompetitorAnalysisArgs,
} from "./analysis-persistence";

export {
  ApifyConfigError,
  ApifyCompetitorScraper,
  buildReelScraperInput,
  encodeWebhooksParam,
  loadApifyConfig,
  parseReelItem,
} from "./scraper";
export type {
  ApifyConfig,
  CompetitorReel,
  ReelScraperActorInput,
  ReelScraperRunBody,
  ReelScraperWebhookConfig,
} from "./scraper";

export {
  ApifyWebhookParseError,
  parseApifyWebhookBody,
  verifyApifyWebhookToken,
} from "./webhook";
export type { ApifyWebhookPayload } from "./webhook";
