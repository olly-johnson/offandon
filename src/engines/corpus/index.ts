export type {
  ClientCorpusHit,
  ClientDocument,
  ClientDocumentChunkInput,
  ClientDocumentInput,
  ClientDocumentSourceType,
  SearchClientCorpusInput,
} from "./types";

export {
  replaceDocumentChunks,
  saveClientDocument,
} from "./persistence";

export {
  formatCorpusHits,
  searchClientCorpus,
} from "./search";
export type { SearchClientCorpusDeps } from "./search";
