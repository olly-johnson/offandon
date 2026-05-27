/**
 * Smaller side cards that appear in the two 2-up grids on the brand
 * dashboard. Story Bank and Identity Depth are still placeholders pending
 * their own tickets; Competitors is wired to the tracked accounts.
 */

import Link from "next/link";

import type { CompetitorSummary, CompetitorSyncStatus } from "../competitors";

export function StoryBankCard() {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Story Bank</div>
      <p style={{ color: "var(--oo-text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        Story usage tracking is coming soon. It will show how many of your story
        bank stories appear across your scripts, and which one performs best.
        Seed your stories in onboarding or the Brand section so they are ready
        when this goes live.
      </p>
    </div>
  );
}

export function IdentityDepthCard() {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Identity Depth</div>
      <p style={{ color: "var(--oo-text-secondary)", fontSize: 13, lineHeight: 1.7 }}>
        Requires video transcription to measure accurately. Once enabled, this
        score measures how much of your personal story, specific language, real
        experiences, philosophy, and unique angles show up in your actual
        videos. The higher the score, the less you blend into noise. Enable by
        running SupaData transcription on your posted videos.
      </p>
    </div>
  );
}

export function CompetitorsCard({ competitors }: { competitors: CompetitorSummary }) {
  if (competitors.count === 0) {
    return (
      <div className="oo-card-static p-6">
        <div className="bd-card-title">Competitors</div>
        <p style={{ color: "var(--oo-text-dim)", fontSize: 13, lineHeight: 1.7 }}>
          No competitors added yet. Add competitors in the{" "}
          <Link href="/research" style={{ color: "var(--oo-gold)" }}>
            Research
          </Link>{" "}
          section to start tracking them here.
        </p>
      </div>
    );
  }

  return (
    <div className="oo-card-static p-6">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="bd-card-title" style={{ marginBottom: 0 }}>
          Competitors
        </div>
        <span style={{ fontSize: 12, color: "var(--oo-text-dim)" }} className="tabular-nums">
          {competitors.count}/{competitors.limit} tracked
        </span>
      </div>
      <div className="mt-3 flex flex-col">
        {competitors.items.map((c, i) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 py-2.5"
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--oo-border-subtle)",
            }}
          >
            <div className="min-w-0">
              <div
                className="truncate"
                style={{ fontSize: 13, color: "var(--oo-text-primary)" }}
                title={`@${c.handle}`}
              >
                @{c.handle}
              </div>
              <div style={{ fontSize: 11, color: "var(--oo-text-dim)" }}>
                {c.platformLabel}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: statusColor(c.status) }}
              />
              <span style={{ fontSize: 11.5, color: "var(--oo-text-secondary)" }}>
                {c.statusLabel}
              </span>
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/research"
        style={{ color: "var(--oo-gold)", fontSize: 12 }}
        className="mt-3 inline-block"
      >
        Manage in Research
      </Link>
    </div>
  );
}

function statusColor(status: CompetitorSyncStatus): string {
  switch (status) {
    case "synced":
      return "#3FB984";
    case "syncing":
      return "var(--oo-gold)";
    case "failed":
      return "#E5484D";
    default:
      return "var(--oo-text-dim)";
  }
}
