/**
 * Shapes the user's tracked competitor_accounts rows into the view model
 * the dashboard Competitors card renders. Pure so the sync-status and
 * relative-time logic is unit-testable without a database.
 */

import { COMPETITOR_LIMIT_PER_USER, type CompetitorRow } from "@/engines/competitor";
import type { CompetitorPlatform } from "@/engines/competitor";

export type CompetitorSyncStatus = "syncing" | "failed" | "synced" | "never";

export interface CompetitorSummaryItem {
  id: string;
  handle: string;
  platform: CompetitorPlatform;
  platformLabel: string;
  status: CompetitorSyncStatus;
  statusLabel: string;
}

export interface CompetitorSummary {
  count: number;
  limit: number;
  items: CompetitorSummaryItem[];
}

const PLATFORM_LABELS: Record<CompetitorPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
};

export function summariseCompetitors(
  rows: CompetitorRow[],
  now: Date,
): CompetitorSummary {
  const items = rows.map((r) => {
    const { status, statusLabel } = syncState(r, now);
    return {
      id: r.id,
      handle: r.username,
      platform: r.platform,
      platformLabel: PLATFORM_LABELS[r.platform] ?? r.platform,
      status,
      statusLabel,
    };
  });
  return { count: items.length, limit: COMPETITOR_LIMIT_PER_USER, items };
}

/**
 * Resolve the row's sync state. Precedence matches how the scraper writes
 * the columns: an in-flight run wins, then the terminal error of the most
 * recent run, then a clean success, then never-synced.
 */
function syncState(
  r: CompetitorRow,
  now: Date,
): { status: CompetitorSyncStatus; statusLabel: string } {
  if (r.sync_pending) return { status: "syncing", statusLabel: "Syncing..." };
  if (r.last_sync_error) return { status: "failed", statusLabel: "Sync failed" };
  if (r.last_synced_at) {
    return { status: "synced", statusLabel: `Synced ${relativeAge(r.last_synced_at, now)}` };
  }
  return { status: "never", statusLabel: "Not synced yet" };
}

function relativeAge(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
