/**
 * `search_client_corpus` chat tool (BO-050).
 *
 * Backed by the corpus engine (BO-049). Extracted from chat/actions.ts so
 * the source-type validation, error wrapping, and hit-formatting can be
 * unit-tested without the "use server" + Next.js plumbing dragging along.
 *
 * The chat actions layer is responsible for:
 *   - skipping construction when VOYAGE_API_KEY is absent
 *   - building the supabase + embeddings deps
 *
 * This module is responsible for:
 *   - declaring the tool name + description + input_schema
 *   - validating the LLM-supplied source_type against our allowlist
 *   - invoking searchClientCorpus and formatting the result for the
 *     LLM's tool_result block
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type ClientDocumentSourceType,
  formatCorpusHits,
  searchClientCorpus,
} from "@/engines/corpus";
import type { IEmbeddingsClient } from "@/lib/shared/embeddings";
import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

import type { ChatToolDefinition } from "./types";

const log = createLogger("chat.search-corpus-tool");

export const SEARCH_CLIENT_CORPUS_TOOL_NAME = "search_client_corpus";

export const VALID_CORPUS_SOURCES: ClientDocumentSourceType[] = [
  "fathom_transcript",
  "questionnaire",
  "note",
  "long_form",
];

/** Max chunks returned to the model per tool call. */
export const SEARCH_CLIENT_CORPUS_TOOL_LIMIT = 6;

export interface BuildSearchCorpusToolArgs {
  supabase: SupabaseClient<Database>;
  embeddings: IEmbeddingsClient;
  userId: string;
}

export function buildSearchCorpusTool(args: BuildSearchCorpusToolArgs): ChatToolDefinition {
  return {
    name: SEARCH_CLIENT_CORPUS_TOOL_NAME,
    description:
      "Search the creator's long-form corpus (Fathom call transcripts, weekly questionnaire responses, long-form notes) for content that matches a query. CALL THIS when the user references a specific past artifact, person, number, date, framework, or detail that is not in the visible conversation history or in the Creator Memory block — for example: 'what did I say about Q3 goals in last week's questionnaire?', 'pull up the story about quitting consulting', 'remind me what I told you on the last Fathom call about my ICP', 'find that framework I described for onboarding'. DO NOT call for general voice/methodology questions (those are already in your system prompt). DO NOT call for things you can answer from the conversation history itself.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A short phrase capturing what to retrieve. Use the creator's own words when possible. Examples: 'Q3 goals questionnaire', 'quitting consulting story', 'onboarding framework', 'ICP description from last call'.",
        },
        source_type: {
          type: "string",
          enum: VALID_CORPUS_SOURCES,
          description:
            "Optional. Narrow the search to one source type when the user names it explicitly ('in last week's questionnaire' -> questionnaire; 'on the Fathom call' -> fathom_transcript). Omit when unsure.",
        },
      },
      required: ["query"],
    },
    handler: async (input) => {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (query.length === 0) {
        return "Error: query was empty; nothing searched.";
      }
      const rawSource = typeof input.source_type === "string" ? input.source_type : undefined;
      const source_type =
        rawSource && (VALID_CORPUS_SOURCES as string[]).includes(rawSource)
          ? (rawSource as ClientDocumentSourceType)
          : undefined;

      try {
        const hits = await searchClientCorpus(
          { supabase: args.supabase, embeddings: args.embeddings },
          {
            user_id: args.userId,
            query,
            limit: SEARCH_CLIENT_CORPUS_TOOL_LIMIT,
            source_type,
          },
        );
        log.info("search_client_corpus tool ran", {
          user_id: args.userId,
          query_chars: query.length,
          source_type,
          hit_count: hits.length,
        });
        return formatCorpusHits(hits);
      } catch (err) {
        log.error("search_client_corpus tool failed", {
          user_id: args.userId,
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error searching corpus: ${
          err instanceof Error ? err.message : "unknown"
        }`;
      }
    },
  };
}
