"use client";

import { useState } from "react";
import Image from "next/image";

import {
  PlatformGlyph,
  platformBrandColor,
  platformLabel,
} from "./platform-icons";
import {
  SUGGESTED_CREATORS,
  suggestedAvatarUrl,
  type SuggestedCreator,
  type SuggestedPlatform,
} from "./suggested-creators";

interface SuggestedCreatorsGridProps {
  /**
   * Already-tracked handles keyed as "platform:handle" lowercase, so
   * the same handle on different platforms doesn't double-disable.
   */
  trackedHandles: Set<string>;
  /** Currently-typed handle in the add form. */
  currentHandle: string;
  /** Currently-selected platform; chip glows when both handle + platform match. */
  currentPlatform: SuggestedPlatform;
  /** Disabled because the user is at the tracking cap. */
  atCap: boolean;
  /** Click handler: fills the add-form input + platform with the chip's values. */
  onPick: (handle: string, platform: SuggestedPlatform) => void;
}

export function SuggestedCreatorsGrid({
  trackedHandles,
  currentHandle,
  currentPlatform,
  atCap,
  onPick,
}: SuggestedCreatorsGridProps) {
  const typed = currentHandle.trim().replace(/^@/, "").toLowerCase();

  return (
    <div
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Suggested creators"
    >
      {SUGGESTED_CREATORS.map((c) => {
        const key = `${c.platform}:${c.handle.toLowerCase()}`;
        const tracked = trackedHandles.has(key);
        const isTyped =
          typed === c.handle.toLowerCase() && currentPlatform === c.platform;
        return (
          <SuggestedChip
            key={key}
            creator={c}
            tracked={tracked}
            highlighted={isTyped}
            disabled={tracked || (atCap && !isTyped)}
            onClick={() => onPick(c.handle, c.platform)}
          />
        );
      })}
    </div>
  );
}

function SuggestedChip({
  creator,
  tracked,
  highlighted,
  disabled,
  onClick,
}: {
  creator: SuggestedCreator;
  tracked: boolean;
  highlighted: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tooltip = tracked
    ? `@${creator.handle} on ${platformLabel(creator.platform)} - already tracked`
    : creator.bio
      ? `@${creator.handle} (${platformLabel(creator.platform)}) - ${creator.bio}`
      : `@${creator.handle} (${platformLabel(creator.platform)})`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-label={tooltip}
      className="flex items-center gap-2.5 rounded-xl p-2.5 text-left transition disabled:opacity-50"
      style={{
        background: highlighted
          ? "var(--oo-bg-hover)"
          : "var(--oo-bg-elevated)",
        border: `1px solid ${
          highlighted ? "var(--oo-gold)" : "var(--oo-border-subtle)"
        }`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <CreatorAvatar creator={creator} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-xs font-semibold"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {creator.handle}
        </span>
        <span
          className="flex items-center gap-1 text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          <PlatformGlyph
            platform={creator.platform}
            className="size-2.5"
            style={{ color: platformBrandColor(creator.platform) }}
          />
          {tracked
            ? "Already tracking"
            : creator.platform === "youtube_shorts"
              ? `${formatCount(creator.follower_count)} subscribers`
              : `${formatCount(creator.follower_count)} followers`}
        </span>
      </span>
    </button>
  );
}

function CreatorAvatar({ creator }: { creator: SuggestedCreator }) {
  const url = suggestedAvatarUrl(creator.handle);
  const [loadError, setLoadError] = useState(false);
  const initial = creator.handle.charAt(0).toUpperCase();
  const showImage = url !== null && !loadError;

  return (
    <span
      aria-hidden
      className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
      style={{
        background: showImage ? "var(--oo-bg-hover)" : gradientFor(creator.handle),
        color: "white",
      }}
    >
      {showImage && url ? (
        <Image
          src={url}
          alt=""
          width={36}
          height={36}
          className="size-full object-cover"
          onError={() => setLoadError(true)}
          unoptimized
        />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * Deterministic warm gradient per handle so the same creator always
 * paints the same avatar placeholder when no bucket image exists.
 */
function gradientFor(handle: string): string {
  let h = 0;
  for (let i = 0; i < handle.length; i++) {
    h = (h * 31 + handle.charCodeAt(i)) | 0;
  }
  const base = Math.abs(h) % 360;
  const a = `hsl(${base}, 55%, 42%)`;
  const b = `hsl(${(base + 40) % 360}, 55%, 32%)`;
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
