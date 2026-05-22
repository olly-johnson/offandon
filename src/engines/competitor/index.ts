export {
  addCompetitor,
  COMPETITOR_LIMIT_PER_USER,
  COMPETITOR_PLATFORMS,
  CompetitorLimitError,
  DuplicateCompetitorError,
  getCompetitorForUser,
  InvalidCompetitorHandleError,
  isCompetitorPlatform,
  listCompetitors,
  normaliseHandle,
  removeCompetitor,
} from "./persistence";
export type {
  CompetitorPlatform,
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

export {
  computeOutliers,
  DEFAULT_OUTLIER_FEED_OPTIONS,
  getOutlierFeed,
} from "./outlier-feed";
export type {
  OutlierFeedItem,
  OutlierFeedOptions,
} from "./outlier-feed";

export {
  buildVaultRow,
  listResearchVault,
  removeFromVault,
  saveToVault,
} from "./vault";
export type {
  VaultListRow,
  VaultRowMetadata,
} from "./vault";
