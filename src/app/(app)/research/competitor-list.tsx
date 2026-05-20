"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";

import {
  addCompetitorAction,
  removeCompetitorAction,
  syncCompetitorAction,
  type AddCompetitorState,
} from "./actions";
import { useCompetitorRealtime } from "./use-competitor-realtime";
import type { CompetitorRow } from "@/engines/competitor";

interface CompetitorListProps {
  userId: string;
  competitors: CompetitorRow[];
  limit: number;
}

export function CompetitorList({ userId, competitors, limit }: CompetitorListProps) {
  useCompetitorRealtime(userId);
  const atCap = competitors.length >= limit;

  return (
    <div className="flex flex-col gap-4">
      <AddCompetitorForm atCap={atCap} />

      {competitors.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {competitors.map((c) => (
            <li key={c.id}>
              <CompetitorRowItem row={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddCompetitorForm({ atCap }: { atCap: boolean }) {
  const [handle, setHandle] = useState("");
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

function CompetitorRowItem({ row }: { row: CompetitorRow }) {
  const inFlight = row.sync_pending;

  return (
    <div
      className="flex items-center justify-between rounded-xl p-3"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex flex-col">
        <a
          href={`https://instagram.com/${row.username}`}
          target="_blank"
          rel="noreferrer noopener"
          className="text-sm font-semibold hover:underline"
          style={{ color: "var(--oo-text-primary)" }}
        >
          @{row.username}
        </a>
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
