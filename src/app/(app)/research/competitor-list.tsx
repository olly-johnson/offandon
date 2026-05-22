"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
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
import { SuggestedCreatorsGrid } from "./suggested-creators-grid";
import { useCompetitorRealtime } from "./use-competitor-realtime";
import { useCompetitorMediaRealtime } from "./use-competitor-media-realtime";
import type {
  CompetitorMediaRow,
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
  const atCap = competitors.length >= limit;
  // Lifted from AddCompetitorForm so the suggested-creators grid can
  // pre-fill the input on chip click.
  const [handle, setHandle] = useState("");
  const trackedHandles = new Set(
    competitors.map((c) => c.username.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <AddCompetitorForm
          atCap={atCap}
          handle={handle}
          setHandle={setHandle}
        />
        <SuggestedCreatorsGrid
          trackedHandles={trackedHandles}
          currentHandle={handle}
          atCap={atCap}
          onPick={setHandle}
        />
      </div>

      {competitors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--oo-text-dim)" }}
          >
            Your watchlist
          </h3>
          <ul className="flex flex-col gap-3">
            {competitors.map((c) => (
              <li key={c.id}>
                <CompetitorRowItem
                  row={c}
                  reels={reelsByCompetitor[c.id] ?? []}
                  analysesByMediaId={analysesByMediaId}
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

function AddCompetitorForm({
  atCap,
  handle,
  setHandle,
}: {
  atCap: boolean;
  handle: string;
  setHandle: (h: string) => void;
}) {
  const [state, formAction, pending] = useActionState<
    AddCompetitorState,
    FormData
  >(async (prev, fd) => {
    const next = await addCompetitorAction(prev, fd);
    if (next.ok) setHandle("");
    return next;
  }, {});

  const trimmed = handle.trim();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
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
}: {
  row: CompetitorRow;
  reels: CompetitorMediaRow[];
  analysesByMediaId: Record<string, MediaAnalysis>;
}) {
  const inFlight = row.sync_pending;

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
            <Link
              href={`/research/${row.id}`}
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--oo-text-primary)" }}
            >
              @{row.username}
            </Link>
            <a
              href={`https://instagram.com/${row.username}`}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open @${row.username} on Instagram`}
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
          <form action={removeCompetitorAction}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              aria-label={`Stop tracking ${row.username}`}
              className="oo-icon-btn rounded-lg p-2"
              title="Stop tracking"
            >
              <Trash2 className="size-4" />
            </button>
          </form>
        </div>
      </div>

      {reels.length > 0 ? (
        <ReelStrip
          competitorId={row.id}
          reels={reels}
          analysesByMediaId={analysesByMediaId}
        />
      ) : null}
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
        <Image
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
