"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import type {
  CompetitorMediaRow,
  CompetitorRow,
} from "@/engines/competitor";
import type { MediaAnalysis } from "@/engines/research";

import { analyzeCompetitorMediaAction } from "../../actions";
import { useCompetitorAnalysisRealtime } from "../use-competitor-analysis-realtime";
import { useCompetitorMediaRealtime } from "../../use-competitor-media-realtime";

const TABS = [
  { key: "action", label: "Action" },
  { key: "metrics", label: "Metrics" },
  { key: "transcript", label: "Transcript" },
  { key: "description", label: "Description" },
  { key: "hook", label: "Hook" },
  { key: "structure", label: "Structure" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface ReelDrillInProps {
  userId: string;
  competitor: CompetitorRow;
  media: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
  channelMedianViews: number | null;
  outlierRatio: number | null;
  engagementRate: number | null;
  siblingCount: number;
}

export function ReelDrillIn({
  userId,
  competitor,
  media,
  analysis,
  channelMedianViews,
  outlierRatio,
  engagementRate,
  siblingCount,
}: ReelDrillInProps) {
  // Live-refresh when an analysis lands or the pending flag flips.
  useCompetitorAnalysisRealtime(userId);
  useCompetitorMediaRealtime(userId);

  const [tab, setTab] = useState<TabKey>(analysis ? "metrics" : "action");

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/research/${competitor.id}`}
        className="inline-flex items-center gap-1 text-xs hover:underline"
        style={{ color: "var(--oo-text-dim)" }}
      >
        <ArrowLeft className="size-3" />
        Back to @{competitor.username}
      </Link>

      <ChannelPill competitor={competitor} />

      <header className="flex flex-col gap-1">
        <h1
          className="line-clamp-2 text-xl font-bold leading-snug"
          style={{
            color: "var(--oo-text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          {analysis?.hook ?? media.caption ?? "(no caption)"}
        </h1>
        <p
          className="flex items-center gap-2 text-xs"
          style={{ color: "var(--oo-text-dim)" }}
        >
          <span>@{competitor.username}</span>
          {media.permalink ? (
            <a
              href={media.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:underline"
            >
              View on Instagram <ExternalLink className="size-3" />
            </a>
          ) : null}
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        <Thumbnail media={media} outlierRatio={outlierRatio} />

        <div className="flex flex-col gap-4">
          <TabBar value={tab} onChange={setTab} hasAnalysis={analysis !== null} />
          <TabPanel
            tab={tab}
            media={media}
            analysis={analysis}
            channelMedianViews={channelMedianViews}
            outlierRatio={outlierRatio}
            engagementRate={engagementRate}
            siblingCount={siblingCount}
          />
        </div>
      </div>
    </div>
  );
}

function ChannelPill({ competitor }: { competitor: CompetitorRow }) {
  return (
    <Link
      href={`/research/${competitor.id}`}
      className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <span
        className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold"
        style={{
          background: gradientFor(competitor.username),
          color: "white",
        }}
      >
        {competitor.username.charAt(0).toUpperCase()}
      </span>
      <span
        className="text-xs font-semibold"
        style={{ color: "var(--oo-text-primary)" }}
      >
        @{competitor.username}
      </span>
    </Link>
  );
}

function Thumbnail({
  media,
  outlierRatio,
}: {
  media: CompetitorMediaRow;
  outlierRatio: number | null;
}) {
  return (
    <div
      className="relative aspect-[9/16] w-full overflow-hidden rounded-xl"
      style={{ background: "var(--oo-bg-elevated)" }}
    >
      {media.thumbnail_url ? (
        <Image
          src={media.thumbnail_url}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 200px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center">
          <Play className="size-8" style={{ color: "var(--oo-text-dim)" }} />
        </div>
      )}
      {outlierRatio !== null ? (
        <span
          className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{ background: "rgba(0,0,0,0.7)", color: "white" }}
          title={`Views vs this channel's median: ${outlierRatio.toFixed(1)}x`}
        >
          <TrendingUp className="size-3" />
          {outlierRatio.toFixed(1)}x
        </span>
      ) : null}
    </div>
  );
}

function TabBar({
  value,
  onChange,
  hasAnalysis,
}: {
  value: TabKey;
  onChange: (k: TabKey) => void;
  hasAnalysis: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TABS.map((t) => {
        const needsAnalysis =
          t.key === "transcript" ||
          t.key === "hook" ||
          t.key === "structure" ||
          t.key === "action";
        const disabled = needsAnalysis && !hasAnalysis;
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => !disabled && onChange(t.key)}
            disabled={disabled}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: active
                ? "var(--oo-bg-hover)"
                : "var(--oo-bg-elevated)",
              border: `1px solid ${
                active ? "var(--oo-gold)" : "var(--oo-border-subtle)"
              }`,
              color: active
                ? "var(--oo-text-primary)"
                : "var(--oo-text-secondary)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function TabPanel({
  tab,
  media,
  analysis,
  channelMedianViews,
  outlierRatio,
  engagementRate,
  siblingCount,
}: {
  tab: TabKey;
  media: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
  channelMedianViews: number | null;
  outlierRatio: number | null;
  engagementRate: number | null;
  siblingCount: number;
}) {
  if (tab === "metrics") {
    return (
      <MetricsTab
        media={media}
        analysis={analysis}
        channelMedianViews={channelMedianViews}
        outlierRatio={outlierRatio}
        engagementRate={engagementRate}
        siblingCount={siblingCount}
      />
    );
  }
  if (tab === "description") {
    return (
      <SectionCard heading="Caption">
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {media.caption ?? "(no caption)"}
        </p>
      </SectionCard>
    );
  }

  if (!analysis) {
    return <AnalysisCTA media={media} />;
  }

  if (tab === "action") {
    return (
      <div className="flex flex-col gap-3">
        {analysis.what_to_repeat ? (
          <SectionCard heading="Do this">
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {analysis.what_to_repeat}
            </p>
          </SectionCard>
        ) : null}
        {analysis.what_worked ? (
          <SectionCard heading="Why it worked">
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              {analysis.what_worked}
            </p>
          </SectionCard>
        ) : null}
        {analysis.pillar_match ? (
          <SectionCard heading="Pillar fit">
            <p
              className="text-sm"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              Aligns with your pillar:{" "}
              <span style={{ color: "var(--oo-gold)" }}>
                {analysis.pillar_match}
              </span>
            </p>
          </SectionCard>
        ) : null}
        {!analysis.what_to_repeat &&
        !analysis.what_worked &&
        !analysis.pillar_match ? (
          <SectionCard heading="No actionable lesson surfaced">
            <p className="text-sm" style={{ color: "var(--oo-text-dim)" }}>
              The analyser couldn&apos;t isolate a reusable lesson from this
              reel. Often happens with very short or non-content posts.
            </p>
          </SectionCard>
        ) : null}
      </div>
    );
  }

  if (tab === "transcript") {
    return (
      <SectionCard heading="Transcript">
        <p
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {analysis.transcript || "(transcript empty)"}
        </p>
      </SectionCard>
    );
  }

  if (tab === "hook") {
    return (
      <SectionCard heading="Hook">
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {analysis.hook ?? "No hook isolated from this reel."}
        </p>
      </SectionCard>
    );
  }

  if (tab === "structure") {
    return (
      <SectionCard heading="Structure">
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {analysis.structure ?? "No structural pattern surfaced."}
        </p>
      </SectionCard>
    );
  }

  return null;
}

function MetricsTab({
  media,
  analysis,
  channelMedianViews,
  outlierRatio,
  engagementRate,
  siblingCount,
}: {
  media: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
  channelMedianViews: number | null;
  outlierRatio: number | null;
  engagementRate: number | null;
  siblingCount: number;
}) {
  return (
    <SectionCard heading="Metrics">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric
          label="Outlier score"
          value={outlierRatio !== null ? `${outlierRatio.toFixed(1)}x` : "-"}
          hint={
            channelMedianViews
              ? `vs channel median ${formatCount(channelMedianViews)} (${siblingCount} reels)`
              : "not enough sibling reels"
          }
          icon={<TrendingUp className="size-3" />}
        />
        <Metric
          label="Views"
          value={formatCount(media.view_count)}
          icon={<Eye className="size-3" />}
        />
        <Metric
          label="Engagement rate"
          value={
            engagementRate !== null
              ? `${(engagementRate * 100).toFixed(1)}%`
              : "-"
          }
          hint="(likes + comments) / views"
          icon={<Heart className="size-3" />}
        />
        <Metric
          label="Likes"
          value={formatCount(media.like_count)}
          icon={<Heart className="size-3" />}
        />
        <Metric
          label="Comments"
          value={formatCount(media.comments_count)}
          icon={<MessageCircle className="size-3" />}
        />
        <Metric
          label="Reach score"
          value={
            analysis?.performance_score !== null &&
            analysis?.performance_score !== undefined
              ? `${analysis.performance_score}%`
              : "-"
          }
          hint="library-relative reach percentile"
        />
      </dl>
    </SectionCard>
  );
}

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg p-3"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <dt
        className="flex items-center gap-1 text-[10px] uppercase tracking-wider"
        style={{ color: "var(--oo-text-dim)" }}
      >
        {icon}
        {label}
      </dt>
      <dd
        className="text-base font-semibold tabular-nums"
        style={{ color: "var(--oo-text-primary)" }}
      >
        {value}
      </dd>
      {hint ? (
        <dd
          className="text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          {hint}
        </dd>
      ) : null}
    </div>
  );
}

function SectionCard({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-2 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--oo-text-dim)" }}
      >
        {heading}
      </h3>
      {children}
    </section>
  );
}

function AnalysisCTA({ media }: { media: CompetitorMediaRow }) {
  if (media.analysis_pending) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl p-4 text-sm"
        style={{
          background: "var(--oo-bg-elevated)",
          border: "1px solid var(--oo-border-subtle)",
          color: "var(--oo-text-dim)",
        }}
      >
        <Loader2 className="oo-spin size-4" />
        Analysing this reel. Updates land automatically when the worker
        finishes.
      </div>
    );
  }

  if (media.analysis_failed_reason) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl p-4 text-sm"
        style={{
          background: "var(--oo-bg-elevated)",
          border: "1px solid rgba(192,57,43,0.25)",
        }}
      >
        <div
          className="flex items-center gap-1.5"
          style={{ color: "var(--oo-bof)" }}
        >
          <AlertTriangle className="size-4" />
          <span className="text-xs font-semibold">
            Last analysis failed: {media.analysis_failed_reason}
          </span>
        </div>
        <AnalyzeForm mediaId={media.id} label="Retry analysis" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4 text-sm"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
        color: "var(--oo-text-secondary)",
      }}
    >
      <p>
        This reel hasn&apos;t been transcribed and analysed yet. Kick it off
        and the tabs above will fill in.
      </p>
      <AnalyzeForm mediaId={media.id} label="Analyse this reel" />
    </div>
  );
}

function AnalyzeForm({ mediaId, label }: { mediaId: string; label: string }) {
  return (
    <form action={analyzeCompetitorMediaAction}>
      <input type="hidden" name="media_id" value={mediaId} />
      <button
        type="submit"
        className="gold-btn flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
      >
        <Sparkles className="size-3" />
        {label}
      </button>
    </form>
  );
}

function formatCount(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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
