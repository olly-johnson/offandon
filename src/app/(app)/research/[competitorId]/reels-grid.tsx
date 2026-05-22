"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ExternalLink,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Sparkles,
} from "lucide-react";

import type { CompetitorMediaRow } from "@/engines/competitor";
import type { MediaAnalysis } from "@/engines/research";

import { analyzeCompetitorMediaAction } from "../actions";
import { useCompetitorMediaRealtime } from "../use-competitor-media-realtime";
import { useCompetitorAnalysisRealtime } from "./use-competitor-analysis-realtime";

interface ReelsGridProps {
  userId: string;
  reels: CompetitorMediaRow[];
  /** media_id -> analysis. Absent keys mean "not analyzed yet". */
  analyses: Record<string, MediaAnalysis>;
}

function performanceBadgeColor(score: number): string {
  if (score >= 80) return "var(--oo-tof)";
  if (score >= 60) return "var(--oo-tof)";
  if (score >= 40) return "var(--oo-text-dim)";
  return "var(--oo-bof)";
}

export function ReelsGrid({ userId, reels, analyses }: ReelsGridProps) {
  // Two subscriptions: one for new analyses landing (INSERT on
  // competitor_media_analysis), one for analysis_pending /
  // analysis_failed_reason flipping on competitor_media itself.
  useCompetitorAnalysisRealtime(userId);
  useCompetitorMediaRealtime(userId);

  if (reels.length === 0) {
    return (
      <div
        className="rounded-xl p-4 text-center text-xs"
        style={{
          background: "var(--oo-bg-elevated)",
          border: "1px dashed var(--oo-border-subtle)",
          color: "var(--oo-text-dim)",
        }}
      >
        No reels yet. Click Sync on this account from /research to pull their
        recent reels.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {reels.map((reel) => (
        <li key={reel.id}>
          <ReelCard reel={reel} analysis={analyses[reel.id] ?? null} />
        </li>
      ))}
    </ul>
  );
}

function ReelCard({
  reel,
  analysis,
}: {
  reel: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
}) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl p-3"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-start gap-3">
        {reel.thumbnail_url ? (
          <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={reel.thumbnail_url}
              alt=""
              fill
              sizes="96px"
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "var(--oo-bg-hover)" }}
          >
            <Play className="size-6" style={{ color: "var(--oo-text-dim)" }} />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className="line-clamp-3 text-xs leading-relaxed"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            {reel.caption ?? "(no caption)"}
          </p>
          <div
            className="mt-1 flex items-center gap-3 text-[11px]"
            style={{ color: "var(--oo-text-dim)" }}
          >
            <span className="flex items-center gap-1">
              <Play className="size-3" />
              {formatCount(reel.view_count)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="size-3" />
              {formatCount(reel.like_count)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3" />
              {formatCount(reel.comments_count)}
            </span>
            {reel.permalink ? (
              <a
                href={reel.permalink}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-auto flex items-center gap-1 hover:underline"
                aria-label="Open reel on Instagram"
              >
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <ReelCardAnalysisPanel reel={reel} analysis={analysis} />
    </article>
  );
}

function ReelCardAnalysisPanel({
  reel,
  analysis,
}: {
  reel: CompetitorMediaRow;
  analysis: MediaAnalysis | null;
}) {
  if (analysis) return <AnalysisFields analysis={analysis} />;

  if (reel.analysis_pending) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg p-2 text-[11px]"
        style={{ background: "var(--oo-bg-hover)", color: "var(--oo-text-dim)" }}
      >
        <Loader2 className="oo-spin size-3" />
        Analysing...
      </div>
    );
  }

  if (reel.analysis_failed_reason) {
    return (
      <div
        className="flex items-center justify-between gap-2 rounded-lg p-2 text-[11px]"
        style={{
          background: "var(--oo-bg-hover)",
          color: "var(--oo-bof)",
          border: "1px solid rgba(192,57,43,0.25)",
        }}
      >
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={reel.analysis_failed_reason}
        >
          <AlertTriangle className="size-3 shrink-0" />
          <span className="truncate">
            Failed: {reel.analysis_failed_reason}
          </span>
        </span>
        <AnalyzeButton mediaId={reel.id} label="Retry" />
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-lg p-2 text-[11px]"
      style={{ background: "var(--oo-bg-hover)", color: "var(--oo-text-dim)" }}
    >
      <span>Not analysed yet</span>
      <AnalyzeButton mediaId={reel.id} label="Analyse" />
    </div>
  );
}

function AnalyzeButton({ mediaId, label }: { mediaId: string; label: string }) {
  return (
    <form action={analyzeCompetitorMediaAction}>
      <input type="hidden" name="media_id" value={mediaId} />
      <button
        type="submit"
        className="gold-btn-outline flex items-center gap-1 rounded-md px-2 py-1 text-[10px]"
      >
        <Sparkles className="size-3" />
        {label}
      </button>
    </form>
  );
}

function AnalysisFields({ analysis }: { analysis: MediaAnalysis }) {
  const score = analysis.performance_score;
  const color = score !== null ? performanceBadgeColor(score) : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg p-2 text-[11px]" style={{ background: "var(--oo-bg-hover)" }}>
      {score !== null && color ? (
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
            style={{ color, border: `1px solid ${color}` }}
            title="Reach: library-relative percentile (100 = top of this creator's library by views, 0 = bottom). Not a quality rating."
          >
            Reach {score}%
          </span>
          {analysis.pillar_match ? (
            <span
              className="text-[10px]"
              style={{ color: "var(--oo-text-dim)" }}
            >
              fits: {analysis.pillar_match}
            </span>
          ) : null}
        </div>
      ) : null}

      {analysis.hook ? (
        <Field label="Hook" value={analysis.hook} />
      ) : null}
      {analysis.structure ? (
        <Field label="Structure" value={analysis.structure} />
      ) : null}
      {analysis.what_to_repeat ? (
        <Field label="Repeat" value={analysis.what_to_repeat} />
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ color: "var(--oo-text-secondary)" }}>
      <span className="font-semibold" style={{ color: "var(--oo-text-primary)" }}>
        {label}:
      </span>{" "}
      {value}
    </p>
  );
}

function formatCount(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
