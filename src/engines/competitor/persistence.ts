import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("competitor.persistence");

export type CompetitorSupabaseClient = SupabaseClient<Database>;

/**
 * Source platform for a tracked competitor. Determines which Apify
 * actor handles the scrape and which parser ingests the dataset.
 * Kept narrow at the application layer; the DB CHECK constraint
 * enforces the same domain.
 */
export type CompetitorPlatform = "instagram" | "tiktok" | "youtube_shorts";

export const COMPETITOR_PLATFORMS: ReadonlySet<CompetitorPlatform> = new Set([
  "instagram",
  "tiktok",
  "youtube_shorts",
]);

export function isCompetitorPlatform(v: unknown): v is CompetitorPlatform {
  return typeof v === "string" && COMPETITOR_PLATFORMS.has(v as CompetitorPlatform);
}

/**
 * Hard cap on tracked competitor accounts per user. Surfaced in the UI
 * as "n/5" and enforced server-side in addCompetitor. Not enforced at
 * the DB layer (would need a trigger); RLS still prevents anyone
 * adding a row for someone else's user_id.
 */
export const COMPETITOR_LIMIT_PER_USER = 5;

const IG_HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;

export class InvalidCompetitorHandleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCompetitorHandleError";
  }
}

export class DuplicateCompetitorError extends Error {
  constructor(handle: string) {
    super(`@${handle} is already tracked`);
    this.name = "DuplicateCompetitorError";
  }
}

export class CompetitorLimitError extends Error {
  constructor() {
    super(`You can track up to ${COMPETITOR_LIMIT_PER_USER} accounts`);
    this.name = "CompetitorLimitError";
  }
}

export interface CompetitorRow {
  id: string;
  username: string;
  platform: CompetitorPlatform;
  display_name: string | null;
  note: string | null;
  added_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
  sync_pending: boolean;
}

/**
 * Strip a leading @, trim, lowercase, and validate against the IG
 * handle charset (letters, digits, dot, underscore; 1-30 chars).
 * Throws InvalidCompetitorHandleError on anything else.
 */
export function normaliseHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, "").toLowerCase();
  if (trimmed.length === 0) {
    throw new InvalidCompetitorHandleError("Handle is required");
  }
  if (!IG_HANDLE_RE.test(trimmed)) {
    throw new InvalidCompetitorHandleError(
      "Handle must be 1-30 chars of letters, digits, dot, or underscore",
    );
  }
  return trimmed;
}

export async function getCompetitorForUser(
  supabase: CompetitorSupabaseClient,
  args: { userId: string; id: string },
): Promise<CompetitorRow | null> {
  const { data, error } = await supabase
    .from("competitor_accounts")
    .select(
      "id, username, platform, display_name, note, added_at, last_synced_at, last_sync_error, sync_pending",
    )
    .eq("id", args.id)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    log.error("competitor_accounts get failed", {
      user_id: args.userId,
      id: args.id,
      code: error.code,
      message: error.message,
    });
    throw new Error(`getCompetitorForUser: ${error.message}`);
  }
  return (data ?? null) as CompetitorRow | null;
}

export async function listCompetitors(
  supabase: CompetitorSupabaseClient,
  userId: string,
): Promise<CompetitorRow[]> {
  const { data, error } = await supabase
    .from("competitor_accounts")
    .select(
      "id, username, platform, display_name, note, added_at, last_synced_at, last_sync_error, sync_pending",
    )
    .eq("user_id", userId)
    .order("added_at", { ascending: true });

  if (error) {
    log.error("competitor_accounts select failed", {
      user_id: userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`listCompetitors: ${error.message}`);
  }
  return (data ?? []) as CompetitorRow[];
}

export interface AddCompetitorResult {
  id: string;
  username: string;
  platform: CompetitorPlatform;
}

export async function addCompetitor(
  supabase: CompetitorSupabaseClient,
  args: {
    userId: string;
    rawHandle: string;
    platform?: CompetitorPlatform;
    now?: Date;
  },
): Promise<AddCompetitorResult> {
  const username = normaliseHandle(args.rawHandle);
  const platform: CompetitorPlatform = args.platform ?? "instagram";
  const existing = await listCompetitors(supabase, args.userId);

  // Uniqueness is per (platform, username) so the same handle can
  // be tracked on IG and TT without colliding.
  if (
    existing.some(
      (row) => row.username === username && row.platform === platform,
    )
  ) {
    throw new DuplicateCompetitorError(username);
  }
  if (existing.length >= COMPETITOR_LIMIT_PER_USER) {
    throw new CompetitorLimitError();
  }

  const stamp = (args.now ?? new Date()).toISOString();
  // sync_pending: true on insert so the row renders "Syncing..." in
  // the UI immediately, before the caller kicks off the actual scrape
  // event. The worker resets it on success / failure like any other
  // sync.
  const { data, error } = await supabase
    .from("competitor_accounts")
    .insert({
      user_id: args.userId,
      username,
      platform,
      added_at: stamp,
      sync_pending: true,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new DuplicateCompetitorError(username);
    }
    log.error("competitor_accounts insert failed", {
      user_id: args.userId,
      code: error.code,
      message: error.message,
    });
    throw new Error(`addCompetitor: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("addCompetitor: insert succeeded but returned no id");
  }
  return { id: data.id, username, platform };
}

export async function removeCompetitor(
  supabase: CompetitorSupabaseClient,
  args: { userId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from("competitor_accounts")
    .delete()
    .eq("id", args.id)
    .eq("user_id", args.userId);

  if (error) {
    log.error("competitor_accounts delete failed", {
      user_id: args.userId,
      id: args.id,
      message: error.message,
    });
    throw new Error(`removeCompetitor: ${error.message}`);
  }
}
