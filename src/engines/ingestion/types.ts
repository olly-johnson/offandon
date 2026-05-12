/**
 * Ingestion Engine: public type surface.
 *
 * Operator-driven flow that reads everything under `clients/<slug>/`
 * (markdown, json), pushes it through an LLM, and produces a structured
 * extract that maps cleanly onto our schema (voice_dna, client_assets,
 * user_memories, user_methodology). The extract is written to disk for
 * operator review BEFORE anything hits the DB.
 *
 * See `supabase/migrations/20260512000000_client_assets.sql` for the
 * companion table that carries the bulk of the per-client material that
 * doesn't fit elsewhere.
 */

import type {
  OnboardingAnswers,
  VoiceDNA,
} from "@/engines/voice/types";

/**
 * One file read off disk for an LLM pass. Body is the raw file contents;
 * relativePath is its position under `clients/<slug>/` (e.g.
 * "story_bank.md", "transcripts/DR1wAh.txt"). Kept as a plain shape so
 * tests can pass synthetic fixtures without touching the filesystem.
 */
export interface ClientSourceFile {
  relativePath: string;
  body: string;
}

export type ClientAssetType = "story" | "viral_reference" | "past_script" | "template";

export interface ExtractedClientAsset {
  asset_type: ClientAssetType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  /** Path under `clients/<slug>/` this asset was derived from. Optional. */
  source_file?: string;
}

export type MemoryCategory =
  | "ongoing_project"
  | "creator_context"
  | "preference"
  | "recent_topic";

export interface ExtractedMemory {
  fact: string;
  category: MemoryCategory;
  /** 1..5; higher = more load-bearing in future prompts. Defaults to 3 if absent. */
  priority?: number;
}

export interface ExtractedProfile {
  display_name: string;
  /** Optional handle (e.g. instagram username); the wizard's free-form. */
  handle?: string;
}

/**
 * The full structured artifact produced by `IngestionExtractor.extract()`.
 * Written verbatim to `clients/<slug>/.extracted.json` so the operator
 * can review (and hand-edit) it before any DB writes happen.
 */
export interface ExtractedClientData {
  profile: ExtractedProfile;
  voice_dna: VoiceDNA;
  source_answers: OnboardingAnswers;
  client_assets: ExtractedClientAsset[];
  user_memories: ExtractedMemory[];
  /** Plain text overlay; loaded verbatim into surface system prompts. */
  user_methodology: string;
}

export const CLIENT_ASSET_TYPES: ClientAssetType[] = [
  "story",
  "viral_reference",
  "past_script",
  "template",
];

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  "ongoing_project",
  "creator_context",
  "preference",
  "recent_topic",
];
