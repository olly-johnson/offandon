"use client";

import Image from "next/image";
import { useTransition, useState } from "react";
import {
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  RefreshCw,
  Bookmark,
} from "lucide-react";

import type { MediaRow } from "@/engines/instagram/persistence";

import {
  disconnectInstagramAction,
  refreshInstagramAction,
  type RefreshState,
} from "./actions";

interface LibraryGridProps {
  connection: {
    ig_username: string | null;
    followers_count: number | null;
    media_count: number | null;
    last_synced_at: string | null;
    last_sync_error: string | null;
  };
  media: MediaRow[];
}

export function LibraryGrid({ connection, media }: LibraryGridProps) {
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

      {refreshState?.cached ? (
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          Cache still fresh. Last sync was within the 24h window.
        </p>
      ) : null}
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
            <MediaCard key={m.id} media={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ media }: { media: MediaRow }) {
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
      </div>
    </article>
  );
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
