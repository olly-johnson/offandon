"use client";

import {
  SUGGESTED_CREATORS,
  type SuggestedCreator,
} from "./suggested-creators";

interface SuggestedCreatorsGridProps {
  /** Lowercase handles the user is already tracking; chips render disabled. */
  trackedHandles: Set<string>;
  /** Currently-typed handle in the add form. Chip glows when it matches. */
  currentHandle: string;
  /** Disabled because the user is at the tracking cap. */
  atCap: boolean;
  /** Click handler: fills the add-form input with this handle. */
  onPick: (handle: string) => void;
}

export function SuggestedCreatorsGrid({
  trackedHandles,
  currentHandle,
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
        const tracked = trackedHandles.has(c.handle.toLowerCase());
        const isTyped = typed === c.handle.toLowerCase();
        return (
          <SuggestedChip
            key={c.handle}
            creator={c}
            tracked={tracked}
            highlighted={isTyped}
            disabled={tracked || (atCap && !isTyped)}
            onClick={() => onPick(c.handle)}
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
  const initial = creator.handle.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        tracked
          ? `@${creator.handle} - already tracked`
          : creator.bio
            ? `@${creator.handle} - ${creator.bio}`
            : `@${creator.handle}`
      }
      aria-label={
        tracked
          ? `${creator.handle}, already tracked`
          : `Use ${creator.handle} as the handle to track`
      }
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
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: gradientFor(creator.handle),
          color: "white",
        }}
      >
        {initial}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-xs font-semibold"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {creator.handle}
        </span>
        <span
          className="text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          {tracked
            ? "Already tracking"
            : `${formatFollowers(creator.follower_count)} followers`}
        </span>
      </span>
    </button>
  );
}

/**
 * Deterministic warm gradient per handle so the same creator always
 * paints the same avatar circle. Hash the handle, pick two HSL hues
 * 40deg apart, lock saturation/lightness to brand-warm values.
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

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
