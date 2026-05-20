import type { SupabaseClient } from "@supabase/supabase-js";

import { createLogger } from "@/lib/shared/logger";
import type { Database } from "@/lib/shared/supabase";

const log = createLogger("competitor.persistence");

export type CompetitorSupabaseClient = SupabaseClient<Database>;

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
  display_name: string | null;
  note: string | null;
  added_at: string;
  last_synced_at: string | null;
  last_sync_error: string | null;
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

export async function listCompetitors(
  supabase: CompetitorSupabaseClient,
  userId: string,
): Promise<CompetitorRow[]> {
  const { data, error } = await supabase
    .from("competitor_accounts")
    .select(
      "id, username, display_name, note, added_at, last_synced_at, last_sync_error",
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

export async function addCompetitor(
  supabase: CompetitorSupabaseClient,
  args: { userId: string; rawHandle: string; now?: Date },
): Promise<void> {
  const username = normaliseHandle(args.rawHandle);
  const existing = await listCompetitors(supabase, args.userId);

  if (existing.some((row) => row.username === username)) {
    throw new DuplicateCompetitorError(username);
  }
  if (existing.length >= COMPETITOR_LIMIT_PER_USER) {
    throw new CompetitorLimitError();
  }

  const stamp = (args.now ?? new Date()).toISOString();
  const { error } = await supabase.from("competitor_accounts").insert({
    user_id: args.userId,
    username,
    added_at: stamp,
  });

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
