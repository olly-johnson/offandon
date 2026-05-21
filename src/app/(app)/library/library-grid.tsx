"use client";

import Image from "next/image";
import { useTransition, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";

import type { MediaRow } from "@/engines/instagram/persistence";
import type { MediaAnalysis } from "@/engines/research";

import {
  disconnectInstagramAction,
  refreshInstagramAction,
  requestMediaAnalysis,
  saveAnalysisAsReference,
  type RefreshState,
} from "./actions";
import { useAnalysisRealtime } from "./use-analysis-realtime";

interface LibraryGridProps {
  /** Current user. Passed in so the realtime channel can filter to this user's rows. */
  userId: string;
  connection: {
    ig_username: string | null;
    followers_count: number | null;
    media_count: number | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
  };
  media: MediaRow[];
  /** media_id -> analysis row. Absent keys mean "not analyzed yet". */
  analyses: Record<string, MediaAnalysis>;
  /** media_ids already saved as a client_assets reference. */
  referencedMediaIds: string[];
}

export function LibraryGrid({
  userId,
  connection,
  media,
  analyses,
  referencedMediaIds,
}: LibraryGridProps) {
  // Refresh the page when any media_analysis row for this user lands.
  // Lets the per-tile spinner clear on its own as soon as the Inngest
  // function writes its result, no manual reload needed.
  useAnalysisRealtime(userId);

  const referencedSet = new Set(referencedMediaIds);
  const [pendingRefresh, startRefresh] = useTransition();
  const [pendingDisconnect, startDisconnect] = useTransition();
  const [refreshState, setRefreshState] = useState<RefreshState | null>(null);

  function handleRefresh() {
    setRefreshState(null);
    startRefresh(async () => {
      const result = await refreshInstagramAction();
      setRefreshState(result);
    });
  }

  function handleDisconnect() {
    if (
      !window.confirm(
        "Disconnect Instagram? Your stored token will be wiped. Your library rows stay.",
      )
    ) {
      return;
    }
    startDisconnect(async () => {
      await disconnectInstagramAction();
    });
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2
            className="text-2xl font-bold"
            style={{
              color: "var(--oo-text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            Content Library
          </h2>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            {connection.ig_username ? (
              <>
                @{connection.ig_username}
                {" . "}
              </>
            ) : null}
            {formatCount(connection.followers_count)} followers
            {" . "}
            {formatCount(connection.media_count)} posts
            {" . "}
            <span style={{ color: "var(--oo-text-dim)" }}>
              {connection.last_synced_at
                ? `synced ${formatRelative(connection.last_synced_at)}`
                : "never synced"}
            </span>
          </p>
          {connection.last_sync_error ? (
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--oo-bof)" }}
            >
              Last sync error: {connection.last_sync_error}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={pendingRefresh || pendingDisconnect}
            className="oo-btn-ghost flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {pendingRefresh ? (
              <Loader2 className="oo-spin size-3.5" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Refresh
          </button>
          <button
            onClick={handleDisconnect}
            disabled={pendingRefresh || pendingDisconnect}
            className="oo-btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
            style={{ color: "var(--oo-bof)" }}
          >
            Disconnect
          </button>
        </div>
      </header>

      {refreshState?.error ? (
        <p className="text-xs" role="alert" style={{ color: "var(--oo-bof)" }}>
          {refreshState.error}
        </p>
      ) : null}

      {media.length === 0 ? (
        <div className="oo-card-static p-10 text-center">
          <p
            className="text-sm"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            No posts synced yet. Hit Refresh to pull from Instagram.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {media.map((m) => (
            <MediaCard
              key={m.id}
              media={m}
              analysis={analyses[m.id] ?? null}
              isReferenced={referencedSet.has(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({
  media,
  analysis,
  isReferenced,
}: {
  media: MediaRow;
  analysis: MediaAnalysis | null;
  isReferenced: boolean;
}) {
  const thumb = media.thumbnail_url ?? media.media_url;
  const isVideo = media.media_type === "VIDEO" || media.media_type === "REELS";

  return (
    <article
      className="oo-card flex flex-col overflow-hidden rounded-xl"
      style={{ borderRadius: "12px" }}
    >
      <div
        className="relative aspect-[9/16] w-full overflow-hidden"
        style={{ background: "var(--oo-bg-elevated)" }}
      >
        {thumb ? (
          <Image
            src={thumb}
            alt={media.caption ?? "Instagram post"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs"
            style={{ color: "var(--oo-text-dim)" }}
          >
            No preview
          </div>
        )}
        {isVideo ? (
          <span
            className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
            }}
          >
            <Play className="size-3" />
            {media.media_type === "REELS" ? "Reel" : "Video"}
          </span>
        ) : null}
        {isReferenced ? (
          <span
            className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: "var(--oo-gold-dim)",
              color: "var(--oo-gold)",
              border: "1px solid var(--oo-border-gold)",
            }}
            title="Saved as a reference for script generation"
          >
            <Star className="size-3" />
            Reference
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {media.caption ? (
          <p
            className="line-clamp-3 text-xs leading-relaxed"
            style={{ color: "var(--oo-text-primary)" }}
          >
            {media.caption}
          </p>
        ) : (
          <p
            className="text-xs italic"
            style={{ color: "var(--oo-text-dim)" }}
          >
            No caption
          </p>
        )}

        <div className="mt-auto flex items-center justify-between text-[11px]">
          <div
            className="flex items-center gap-3"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <Stat icon={<Eye className="size-3" />} value={media.reach} />
            <Stat icon={<Heart className="size-3" />} value={media.like_count} />
            <Stat
              icon={<MessageCircle className="size-3" />}
              value={media.comments_count}
            />
            <Stat icon={<Bookmark className="size-3" />} value={media.saved} />
          </div>
          {media.permalink ? (
            <a
              href={media.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-60 transition-opacity hover:opacity-100"
              style={{ color: "var(--oo-gold)" }}
              aria-label="Open on Instagram"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        {isVideo ? (
          <AnalysisSection
            mediaId={media.id}
            analysis={analysis}
            isReferenced={isReferenced}
          />
        ) : null}
      </div>
    </article>
  );
}

function AnalysisSection({
  mediaId,
  analysis,
  isReferenced,
}: {
  mediaId: string;
  analysis: MediaAnalysis | null;
  isReferenced: boolean;
}) {
  const [pendingAnalyze, startAnalyze] = useTransition();
  const [pendingSave, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticallyQueued, setOptimisticallyQueued] = useState(false);
  const [optimisticallyReferenced, setOptimisticallyReferenced] =
    useState(isReferenced);

  function handleAnalyze() {
    setError(null);
    setOptimisticallyQueued(true);
    startAnalyze(async () => {
      const result = await requestMediaAnalysis(mediaId);
      if (result.error) {
        setError(result.error);
        setOptimisticallyQueued(false);
      }
      // Successful queue: keep optimistic flag; the next page render
      // (after revalidatePath) will replace it with the real analysis.
    });
  }

  function handleSaveAsReference() {
    setError(null);
    setOptimisticallyReferenced(true);
    startSave(async () => {
      const result = await saveAnalysisAsReference(mediaId);
      if (result.error) {
        setError(result.error);
        setOptimisticallyReferenced(isReferenced);
      }
    });
  }

  if (!analysis) {
    return (
      <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--oo-border)" }}>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={pendingAnalyze || optimisticallyQueued}
          className="oo-btn-ghost flex w-full items-center justify-center gap-2 px-3 py-1.5 text-[11px] disabled:opacity-50"
        >
          {pendingAnalyze || optimisticallyQueued ? (
            <>
              <Loader2 className="oo-spin size-3" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="size-3" />
              Analyze
            </>
          )}
        </button>
        {error ? (
          <p className="mt-1 text-[10px]" role="alert" style={{ color: "var(--oo-bof)" }}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const showSaved = optimisticallyReferenced;
  return (
    <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--oo-border)" }}>
      <div className="flex flex-col gap-1.5">
        {analysis.performance_score !== null ? (
          <PerformanceBadge score={analysis.performance_score} />
        ) : null}
        {analysis.hook ? (
          <p
            className="line-clamp-2 text-[11px] font-semibold leading-snug"
            style={{ color: "var(--oo-text-primary)" }}
            title={analysis.hook}
          >
            Hook: {analysis.hook}
          </p>
        ) : null}
        {analysis.structure ? (
          <p className="text-[10px]" style={{ color: "var(--oo-text-secondary)" }}>
            {analysis.structure}
          </p>
        ) : null}
        {analysis.pillar_match ? (
          <p className="text-[10px]" style={{ color: "var(--oo-text-dim)" }}>
            Pillar: {analysis.pillar_match}
          </p>
        ) : null}
        {analysis.what_to_repeat ? (
          <p
            className="mt-1 line-clamp-2 text-[10px] italic"
            style={{ color: "var(--oo-text-secondary)" }}
            title={analysis.what_to_repeat}
          >
            Repeat: {analysis.what_to_repeat}
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleSaveAsReference}
          disabled={pendingSave || showSaved}
          className="oo-btn-ghost mt-1 flex w-full items-center justify-center gap-1.5 px-2 py-1 text-[10px] disabled:opacity-60"
        >
          {showSaved ? (
            <>
              <BookmarkCheck className="size-3" />
              Saved as reference
            </>
          ) : pendingSave ? (
            <>
              <Loader2 className="oo-spin size-3" />
              Saving...
            </>
          ) : (
            <>
              <Bookmark className="size-3" />
              Save as reference
            </>
          )}
        </button>
        {error ? (
          <p className="text-[10px]" role="alert" style={{ color: "var(--oo-bof)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PerformanceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const style = performanceBadgeStyle(score);
  return (
    <span
      className="inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ background: style.bg, color: style.fg }}
      title="Library-relative engagement score (0-10)"
    >
      {score}/10
    </span>
  );
}

function performanceBadgeStyle(score: number): { bg: string; fg: string } {
  if (score >= 8) {
    return { bg: "rgba(22,163,74,0.12)", fg: "var(--oo-tof)" };
  }
  if (score >= 6) {
    return { bg: "rgba(22,163,74,0.06)", fg: "var(--oo-tof)" };
  }
  if (score >= 4) {
    return { bg: "var(--oo-bg-elevated)", fg: "var(--oo-text-secondary)" };
  }
  if (score >= 2) {
    return { bg: "rgba(192,57,43,0.06)", fg: "var(--oo-bof)" };
  }
  return { bg: "rgba(192,57,43,0.12)", fg: "var(--oo-bof)" };
}

function Stat({
  icon,
  value,
}: {
  icon: React.ReactNode;
  value: number | null;
}) {
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      {icon}
      {formatCount(value)}
    </span>
  );
}

function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
