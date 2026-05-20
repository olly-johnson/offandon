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
