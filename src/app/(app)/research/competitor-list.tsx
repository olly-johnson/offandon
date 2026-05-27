"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";

import {
  addCompetitorAction,
  removeCompetitorAction,
  syncCompetitorAction,
  type AddCompetitorState,
} from "./actions";
import { PlatformGlyph, platformBrandColor, platformLabel } from "./platform-icons";
import { ReelThumbnail } from "./reel-thumbnail";
import { SuggestedCreatorsGrid } from "./suggested-creators-grid";
import {
  buildOptimisticRow,
  competitorKey,
  isOptimisticId,
  mergeWatchlist,
} from "./watchlist";
import { useCompetitorRealtime } from "./use-competitor-realtime";
import { useCompetitorMediaRealtime } from "./use-competitor-media-realtime";
import type {
  CompetitorMediaRow,
  CompetitorPlatform,
  CompetitorRow,
} from "@/engines/competitor";
import type { MediaAnalysis } from "@/engines/research";

interface CompetitorListProps {
  userId: string;
  competitors: CompetitorRow[];
  limit: number;
  reelsByCompetitor: Record<string, CompetitorMediaRow[]>;
  analysesByMediaId: Record<string, MediaAnalysis>;
}

export function CompetitorList({
  userId,
  competitors,
  limit,
  reelsByCompetitor,
  analysesByMediaId,
}: CompetitorListProps) {
  // Two realtime channels: one for competitor_accounts (sync state badge)
  // and one for competitor_media (preview-strip analysis state).
  useCompetitorRealtime(userId);
  useCompetitorMediaRealtime(userId);

  // Optimistic removals. Deleting via a plain server-action form was
  // racy: the realtime DELETE event fires router.refresh(), and that
  // refresh can re-render from an RSC snapshot taken before the delete
  // committed, re-painting the just-removed row so it took two clicks.
  // Tracking removed ids client-side hides the row instantly and keeps
  // it hidden through any in-flight refresh; the server action still
  // does the real delete, and a failure self-corrects on the next sync.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [, startRemove] = useTransition();

  // Optimistic adds. Pressing "Track" drops a placeholder card on the
  // watchlist instantly, before the server insert + initial scrape
  // round-trip. mergeWatchlist dedupes by (platform, handle) so the
  // placeholder is replaced by the real row the moment it arrives via
  // revalidation, with no flicker. Stale entries are harmless: once a
  // matching server row exists, the placeholder is filtered out every
  // render. A rejected add is rolled back in the form action below.
  const [optimisticAdds, setOptimisticAdds] = useState<CompetitorRow[]>([]);

  const visibleCompetitors = useMemo(
    () => mergeWatchlist(competitors, optimisticAdds, removedIds),
    [competitors, optimisticAdds, removedIds],
  );

  function onRemove(id: string) {
    setRemovedIds((prev) => new Set(prev).add(id));
    // Optimistic placeholders never hit the DB, so there's nothing to
    // delete server-side; hiding them via removedIds is enough.
    if (isOptimisticId(id)) return;
    startRemove(async () => {
      const fd = new FormData();
      fd.set("id", id);
      await removeCompetitorAction(fd);
    });
  }

  function onOptimisticAdd(rawHandle: string, p: CompetitorPlatform) {
    const row = buildOptimisticRow(p, rawHandle);
    if (!row) return;
    setOptimisticAdds((prev) =>
      prev.some((a) => a.id === row.id) ? prev : [...prev, row],
    );
  }

  function onOptimisticAddFailed(rawHandle: string, p: CompetitorPlatform) {
    const row = buildOptimisticRow(p, rawHandle);
    if (!row) return;
    setOptimisticAdds((prev) => prev.filter((a) => a.id !== row.id));
  }

  const atCap = visibleCompetitors.length >= limit;
  // Lifted from AddCompetitorForm so the suggested-creators grid can
  // pre-fill the input on chip click. Platform is also lifted so a
  // suggested TT/YT chip click sets the right scrape destination.
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<CompetitorPlatform>("instagram");
  const trackedHandles = new Set(
    visibleCompetitors.map((c) => competitorKey(c.platform, c.username)),
  );

  function onPick(h: string, p: CompetitorPlatform) {
    setHandle(h);
    setPlatform(p);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <AddCompetitorForm
          atCap={atCap}
          handle={handle}
          setHandle={setHandle}
          platform={platform}
          setPlatform={setPlatform}
          onOptimisticAdd={onOptimisticAdd}
          onOptimisticAddFailed={onOptimisticAddFailed}
        />
        <SuggestedCreatorsGrid
          trackedHandles={trackedHandles}
          currentHandle={handle}
          currentPlatform={platform}
          atCap={atCap}
          onPick={onPick}
        />
      </div>

      {visibleCompetitors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--oo-text-dim)" }}
          >
            Your watchlist
          </h3>
          <ul className="flex flex-col gap-3">
            {visibleCompetitors.map((c) => (
              <li key={c.id}>
                <CompetitorRowItem
                  row={c}
                  reels={reelsByCompetitor[c.id] ?? []}
                  analysesByMediaId={analysesByMediaId}
                  onRemove={onRemove}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}

// YouTube Shorts is temporarily omitted while its analysis pipeline is
// disabled; the type + backend still support it, so re-add the option
// here to bring it back.
const PLATFORM_PICKER_OPTIONS: { value: CompetitorPlatform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

function AddCompetitorForm({
  atCap,
  handle,
  setHandle,
  platform,
  setPlatform,
  onOptimisticAdd,
  onOptimisticAddFailed,
}: {
  atCap: boolean;
  handle: string;
  setHandle: (h: string) => void;
  platform: CompetitorPlatform;
  setPlatform: (p: CompetitorPlatform) => void;
  onOptimisticAdd: (handle: string, platform: CompetitorPlatform) => void;
  onOptimisticAddFailed: (handle: string, platform: CompetitorPlatform) => void;
}) {
  const [state, formAction, pending] = useActionState<
    AddCompetitorState,
    FormData
  >(async (prev, fd) => {
    const handleVal = (fd.get("handle") ?? "").toString();
    const platformVal = ((fd.get("platform") ?? "instagram").toString() ||
      "instagram") as CompetitorPlatform;
    // Drop the placeholder card before awaiting the server so it shows
    // up the instant the form is submitted. Cleared on the next render
    // when the real row lands; rolled back if the server rejects it.
    onOptimisticAdd(handleVal, platformVal);
    const next = await addCompetitorAction(prev, fd);
    if (next.ok) {
      setHandle("");
    } else {
      onOptimisticAddFailed(handleVal, platformVal);
    }
    return next;
  }, {});

  const trimmed = handle.trim();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <PlatformPicker
          value={platform}
          onChange={setPlatform}
          disabled={atCap || pending}
        />
        <input type="hidden" name="platform" value={platform} />
        <input
          name="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={atCap ? "Limit reached" : "@competitor_handle"}
          autoComplete="off"
          spellCheck={false}
          disabled={atCap || pending}
          className="oo-input flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={atCap || pending || trimmed.length === 0}
          className="gold-btn flex items-center gap-2 px-4 text-xs disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="oo-spin size-3.5" />
              Adding
            </>
          ) : (
            <>
              <Plus className="size-3.5" />
              Track
            </>
          )}
        </button>
      </div>
      {state.error ? (
        <p
          className="text-xs"
          role="alert"
          style={{ color: "var(--oo-bof)" }}
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function PlatformPicker({
  value,
  onChange,
  disabled,
}: {
  value: CompetitorPlatform;
  onChange: (p: CompetitorPlatform) => void;
  disabled: boolean;
}) {
  const current = PLATFORM_PICKER_OPTIONS.find((o) => o.value === value)!;
  return (
    <label
      className="relative inline-flex items-center"
      title={`Tracking on ${current.label}`}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold"
        style={{
          background: "var(--oo-bg-elevated)",
          border: "1px solid var(--oo-border-subtle)",
          color: "var(--oo-text-primary)",
          height: "100%",
        }}
      >
        <PlatformGlyph
          platform={value}
          className="size-3"
          style={{ color: platformBrandColor(value) }}
        />
        {platformLabel(value)}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as CompetitorPlatform)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Track on platform"
      >
        {PLATFORM_PICKER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface SyncBadgeProps {
  syncPending: boolean;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

function SyncBadge({ syncPending, lastSyncedAt, lastSyncError }: SyncBadgeProps) {
  if (syncPending) {
    return (
      <span className="text-[11px]" style={{ color: "var(--oo-text-dim)" }}>
        Syncing...
      </span>
    );
  }
  if (lastSyncError) {
    return (
      <span
        className="text-[11px]"
        style={{ color: "var(--oo-bof)" }}
        title={lastSyncError}
      >
        Sync failed
      </span>
    );
  }
  if (lastSyncedAt) {
    return (
      <span className="text-[11px]" style={{ color: "var(--oo-text-dim)" }}>
        Last sync {new Date(lastSyncedAt).toLocaleDateString()}
      </span>
    );
  }
  return (
    <span className="text-[11px]" style={{ color: "var(--oo-text-dim)" }}>
      Not synced yet
    </span>
  );
}

function CompetitorRowItem({
  row,
  reels,
  analysesByMediaId,
  onRemove,
}: {
  row: CompetitorRow;
  reels: CompetitorMediaRow[];
  analysesByMediaId: Record<string, MediaAnalysis>;
  onRemove: (id: string) => void;
}) {
  const inFlight = row.sync_pending;
  // Placeholder rows aren't persisted yet: no detail page to link to,
  // and nothing to sync / remove server-side until the insert lands.
  const optimistic = isOptimisticId(row.id);

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-3"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <PlatformGlyph
              platform={row.platform}
              className="size-3"
              style={{ color: platformBrandColor(row.platform) }}
            />
            {optimistic ? (
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--oo-text-primary)" }}
              >
                @{row.username}
              </span>
            ) : (
              <Link
                href={`/research/${row.id}`}
                className="text-sm font-semibold hover:underline"
                style={{ color: "var(--oo-text-primary)" }}
              >
                @{row.username}
              </Link>
            )}
            <a
              href={publicProfileUrl(row)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open @${row.username} on ${platformLabel(row.platform)}`}
              className="opacity-50 hover:opacity-100"
              style={{ color: "var(--oo-text-dim)" }}
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
          <SyncBadge
            syncPending={row.sync_pending}
            lastSyncedAt={row.last_synced_at}
            lastSyncError={row.last_sync_error}
          />
        </div>
        {optimistic ? null : (
          <div className="flex items-center gap-1">
            <form action={syncCompetitorAction}>
              <input type="hidden" name="id" value={row.id} />
              <button
                type="submit"
                aria-label={`Sync ${row.username} now`}
                className="oo-icon-btn rounded-lg p-2 disabled:opacity-40"
                title={inFlight ? "Sync in progress" : "Sync now"}
                disabled={inFlight}
              >
                {inFlight ? (
                  <Loader2 className="oo-spin size-4" />
                ) : (
                  <RefreshCcw className="size-4" />
                )}
              </button>
            </form>
            <button
              type="button"
              onClick={() => onRemove(row.id)}
              aria-label={`Stop tracking ${row.username}`}
              className="oo-icon-btn rounded-lg p-2"
              title="Stop tracking"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </div>

      {reels.length > 0 ? (
        <ReelStrip
          competitorId={row.id}
          reels={reels}
          analysesByMediaId={analysesByMediaId}
        />
      ) : inFlight ? (
        // First sync in progress and we don't have reels yet. Show
        // skeleton tiles so the row doesn't look frozen during the
        // ~30-90s Apify scrape window.
        <SkeletonReelStrip />
      ) : null}
    </div>
  );
}

function SkeletonReelStrip() {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      aria-label="Sync in progress"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="relative h-28 w-20 shrink-0 animate-pulse overflow-hidden rounded-lg"
          style={{ background: "var(--oo-bg-hover)" }}
        >
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1 py-1 text-[9px]">
            <Loader2
              className="oo-spin size-2.5"
              style={{ color: "var(--oo-text-dim)" }}
            />
            <span style={{ color: "var(--oo-text-dim)" }}>Fetching</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReelStrip({
  competitorId,
  reels,
  analysesByMediaId,
}: {
  competitorId: string;
  reels: CompetitorMediaRow[];
  analysesByMediaId: Record<string, MediaAnalysis>;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
      aria-label="Recent reels"
    >
      {reels.map((reel) => (
        <ReelThumb
          key={reel.id}
          competitorId={competitorId}
          reel={reel}
          analysis={analysesByMediaId[reel.id] ?? null}
        />
      ))}
    </div>
  );
}

function ReelThumb({
  competitorId,
  reel,
  analysis,
}: {
  competitorId: string;
  reel: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
}) {
  const state: "analyzed" | "pending" | "failed" | "idle" = analysis
    ? "analyzed"
    : reel.analysis_pending
      ? "pending"
      : reel.analysis_failed_reason
        ? "failed"
        : "idle";

  return (
    <Link
      href={`/research/${competitorId}/${reel.id}`}
      className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg"
      style={{ background: "var(--oo-bg-hover)" }}
      title={
        analysis?.hook ??
        reel.analysis_failed_reason ??
        reel.caption ??
        undefined
      }
    >
      {reel.thumbnail_url ? (
        <ReelThumbnail
          src={reel.thumbnail_url}
          alt=""
          fill
          sizes="80px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Play className="size-5" style={{ color: "var(--oo-text-dim)" }} />
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 flex items-center gap-1 px-1 py-1 text-[9px] font-semibold"
        style={{
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          color: "white",
        }}
      >
        {state === "analyzed" ? (
          <span className="tabular-nums" title="Library-relative reach percentile (0-100)">
            {analysis?.performance_score !== null &&
            analysis?.performance_score !== undefined
              ? `Reach ${analysis.performance_score}%`
              : "Analysed"}
          </span>
        ) : state === "pending" ? (
          <>
            <Loader2 className="oo-spin size-2.5" />
            <span>Analysing</span>
          </>
        ) : state === "failed" ? (
          <>
            <AlertTriangle className="size-2.5" />
            <span>Failed</span>
          </>
        ) : (
          <span style={{ opacity: 0.7 }}>Tap to analyse</span>
        )}
      </div>
    </Link>
  );
}

function publicProfileUrl(row: CompetitorRow): string {
  if (row.platform === "tiktok") return `https://www.tiktok.com/@${row.username}`;
  if (row.platform === "youtube_shorts")
    return `https://www.youtube.com/@${row.username}`;
  return `https://instagram.com/${row.username}`;
}

function EmptyState() {
  return (
    <div
      className="rounded-xl p-4 text-center text-xs"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px dashed var(--oo-border-subtle)",
        color: "var(--oo-text-dim)",
      }}
    >
      No competitors tracked yet. Add up to 5 to start building your hook bank.
    </div>
  );
}
