"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, MessageCircle, Heart, TrendingUp } from "lucide-react";

import type {
  OutlierFeedItem,
  OutlierFeedPlatform,
} from "@/engines/competitor/outlier-feed";

import { PlatformGlyph, platformBrandColor } from "./platform-icons";

interface OutlierFeedProps {
  items: OutlierFeedItem[];
  /** Surfaced to size the empty state copy correctly. */
  hasCompetitors: boolean;
  /** Current filter selections, read server-side from URL search params. */
  filters: {
    minOutlierRatio: number;
    windowDays: number;
    minViews: number;
    platform: OutlierFeedPlatform;
  };
}

interface NumericOption {
  value: number;
  label: string;
}

interface StringOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

const OUTLIER_OPTIONS: NumericOption[] = [
  { value: 2, label: "2x outlier" },
  { value: 3, label: "3x outlier" },
  { value: 5, label: "5x outlier" },
  { value: 10, label: "10x outlier" },
];

const WINDOW_OPTIONS: NumericOption[] = [
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 3 months" },
  { value: 180, label: "Last 6 months" },
  { value: 365, label: "Last year" },
];

const VIEWS_OPTIONS: NumericOption[] = [
  { value: 0, label: "Any views" },
  { value: 100_000, label: "100K+ views" },
  { value: 500_000, label: "500K+ views" },
  { value: 1_000_000, label: "1M+ views" },
  { value: 10_000_000, label: "10M+ views" },
];

const PLATFORM_OPTIONS: StringOption<OutlierFeedPlatform>[] = [
  { value: "all", label: "All platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok (soon)", disabled: true },
  {
    value: "youtube_shorts",
    label: "YouTube Shorts (soon)",
    disabled: true,
  },
];

export function OutlierFeed({ items, hasCompetitors, filters }: OutlierFeedProps) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(search.toString());
    next.set(key, value);
    startTransition(() => {
      router.replace(`/research?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--oo-gold)" }}
        >
          Step 2
        </span>
        <h2
          className="text-2xl font-bold"
          style={{
            color: "var(--oo-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Find Outlier Videos
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          Explore the top performing videos in your niche. Each reel is judged
          against its own channel&apos;s baseline, so a small-account banger
          ranks higher than a routine big-account post.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <NumericFilterChip
          label={labelFor(VIEWS_OPTIONS, filters.minViews)}
          options={VIEWS_OPTIONS}
          value={filters.minViews}
          onChange={(v) => setParam("views", String(v))}
          pending={pending}
        />
        <StringFilterChip
          label={
            PLATFORM_OPTIONS.find((p) => p.value === filters.platform)?.label ??
            PLATFORM_OPTIONS[0].label
          }
          options={PLATFORM_OPTIONS}
          value={filters.platform}
          onChange={(v) => setParam("platform", v)}
          pending={pending}
        />
        <NumericFilterChip
          label={labelFor(OUTLIER_OPTIONS, filters.minOutlierRatio)}
          options={OUTLIER_OPTIONS}
          value={filters.minOutlierRatio}
          onChange={(v) => setParam("outlier", String(v))}
          pending={pending}
        />
        <NumericFilterChip
          label={labelFor(WINDOW_OPTIONS, filters.windowDays)}
          options={WINDOW_OPTIONS}
          value={filters.windowDays}
          onChange={(v) => setParam("window", String(v))}
          pending={pending}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState hasCompetitors={hasCompetitors} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={`${item.competitor_id}:${item.id}`}>
              <OutlierTile item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function labelFor(options: NumericOption[], value: number): string {
  return options.find((o) => o.value === value)?.label ?? options[0].label;
}

function ChipShell({
  label,
  pending,
  children,
}: {
  label: string;
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className="relative inline-flex items-center"
      style={{ opacity: pending ? 0.5 : 1 }}
    >
      <span
        className="rounded-full px-3 py-1.5 text-xs font-medium"
        style={{
          background: "var(--oo-bg-elevated)",
          border: "1px solid var(--oo-border-subtle)",
          color: "var(--oo-text-primary)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function NumericFilterChip({
  label,
  options,
  value,
  onChange,
  pending,
}: {
  label: string;
  options: NumericOption[];
  value: number;
  onChange: (v: number) => void;
  pending: boolean;
}) {
  return (
    <ChipShell label={label} pending={pending}>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </ChipShell>
  );
}

function StringFilterChip<T extends string>({
  label,
  options,
  value,
  onChange,
  pending,
}: {
  label: string;
  options: StringOption<T>[];
  value: T;
  onChange: (v: T) => void;
  pending: boolean;
}) {
  return (
    <ChipShell label={label} pending={pending}>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </ChipShell>
  );
}

function OutlierTile({ item }: { item: OutlierFeedItem }) {
  return (
    <Link
      href={`/research/${item.competitor_id}`}
      className="flex flex-col gap-2 rounded-xl p-2 transition hover:opacity-90"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
      title={item.caption ?? undefined}
    >
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-lg"
        style={{ background: "var(--oo-bg-hover)" }}
      >
        {item.thumbnail_url ? (
          <Image
            src={item.thumbnail_url}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        ) : null}
        <span
          className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{ background: "rgba(0,0,0,0.7)", color: "white" }}
          title={`Views vs this channel's median: ${item.outlier_ratio.toFixed(1)}x`}
        >
          <TrendingUp className="size-2.5" />
          {item.outlier_ratio.toFixed(1)}x
        </span>
        <span
          aria-hidden
          className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
          style={{
            background: "rgba(0,0,0,0.6)",
            color: platformBrandColor("instagram"),
          }}
        >
          <PlatformGlyph platform="instagram" className="size-3" />
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span
          className="line-clamp-2 text-[11px] leading-snug"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {item.caption ?? "(no caption)"}
        </span>
        <span
          className="text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          @{item.competitor_username}
        </span>
        <div
          className="flex items-center gap-2.5 text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          <span className="flex items-center gap-0.5 tabular-nums">
            <Eye className="size-2.5" />
            {formatCount(item.view_count)}
          </span>
          <span className="flex items-center gap-0.5 tabular-nums">
            <Heart className="size-2.5" />
            {formatCount(item.like_count)}
          </span>
          <span className="flex items-center gap-0.5 tabular-nums">
            <MessageCircle className="size-2.5" />
            {formatCount(item.comments_count)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ hasCompetitors }: { hasCompetitors: boolean }) {
  return (
    <div
      className="rounded-xl p-4 text-center text-xs"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px dashed var(--oo-border-subtle)",
        color: "var(--oo-text-dim)",
      }}
    >
      {hasCompetitors
        ? "No reels cross this threshold yet. Loosen the outlier ratio or widen the time window, or wait for the next sync to bring fresh reels in."
        : "Track a few competitors above and outliers will surface here as their videos sync."}
    </div>
  );
}

function formatCount(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
