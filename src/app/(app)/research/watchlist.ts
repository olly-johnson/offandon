/**
 * Pure helpers for the optimistic watchlist on /research.
 *
 * Pressing "Track" should drop a card onto the watchlist instantly,
 * before the server insert + initial scrape round-trip. We hold those
 * pending cards in client state and merge them with the server rows,
 * deduping by (platform, handle) so the optimistic placeholder is
 * dropped the moment the real row arrives via revalidation / realtime.
 * Optimistic removals (see CompetitorList) compose through the same
 * removedIds set.
 */

import type { CompetitorPlatform, CompetitorRow } from "@/engines/competitor";

/** Normalised dedupe key: platform + handle with a leading @ stripped, lowercased. */
export function competitorKey(platform: string, username: string): string {
  return `${platform}:${username.trim().replace(/^@+/, "").toLowerCase()}`;
}

const OPTIMISTIC_PREFIX = "optimistic:";

/** True when an id is a client-side placeholder, not a persisted row. */
export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PREFIX);
}

/**
 * Build a placeholder watchlist row for a handle the user just tracked.
 * Returns null for an empty handle. The id is derived from the key so a
 * double-submit produces the same id (and dedupes), and sync_pending is
 * true so it renders the "Syncing..." badge + skeleton tiles, matching
 * the real row's initial state for a seamless handoff.
 */
export function buildOptimisticRow(
  platform: CompetitorPlatform,
  rawHandle: string,
  now: Date = new Date(),
): CompetitorRow | null {
  const username = rawHandle.trim().replace(/^@+/, "").toLowerCase();
  if (username === "") return null;
  return {
    id: `${OPTIMISTIC_PREFIX}${platform}:${username}`,
    username,
    platform,
    display_name: null,
    note: null,
    added_at: now.toISOString(),
    last_synced_at: null,
    last_sync_error: null,
    sync_pending: true,
  };
}

/**
 * Merge server rows with optimistic adds, applying optimistic removals.
 * Server rows win: an optimistic add whose (platform, handle) already
 * exists server-side is dropped, so the real row replaces the
 * placeholder without a flicker or duplicate.
 */
export function mergeWatchlist(
  serverRows: CompetitorRow[],
  optimisticAdds: CompetitorRow[],
  removedIds: ReadonlySet<string>,
): CompetitorRow[] {
  const visibleServer = serverRows.filter((r) => !removedIds.has(r.id));
  const seen = new Set(
    visibleServer.map((r) => competitorKey(r.platform, r.username)),
  );

  const pendingAdds: CompetitorRow[] = [];
  for (const add of optimisticAdds) {
    if (removedIds.has(add.id)) continue;
    const key = competitorKey(add.platform, add.username);
    if (seen.has(key)) continue;
    seen.add(key);
    pendingAdds.push(add);
  }

  return [...visibleServer, ...pendingAdds];
}
