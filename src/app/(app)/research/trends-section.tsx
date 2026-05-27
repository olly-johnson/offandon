import type { ReactNode } from "react";
import {
  Eye,
  Flame,
  Heart,
  Minus,
  Quote,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type {
  ResearchTrends,
  TrendDimension,
  TrendHook,
} from "@/lib/shared/research-trends";

import { platformLabel } from "./platform-icons";
import { TrendsChart } from "./trends-chart";

const HOOK_TYPE_LABELS: Record<string, string> = {
  STORYTELLING: "Storytelling",
  CONFRONTATIONAL: "Confrontational",
  VULNERABILITY: "Vulnerability",
  CURIOSITY: "Curiosity",
  PROOF: "Proof",
  EDUCATIONAL: "Educational",
};

function prettyHookType(v: string | null): string {
  if (!v) return "Unclassified";
  return HOOK_TYPE_LABELS[v] ?? v;
}

export function TrendsSection({ trends }: { trends: ResearchTrends }) {
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--oo-gold)" }}
        >
          Step 5
        </span>
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--oo-text-primary)", letterSpacing: "-0.03em" }}
        >
          What is Working Now
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          The topics, hook types, and platforms pulling the most traction
          across the outliers of every creator you track, over the last{" "}
          {trends.windowDays} days, and how the top topics are shifting month
          over month.
        </p>
      </header>

      {trends.sampleSize === 0 ? (
        <EmptyState />
      ) : (
        <>
          <HeadlineChips trends={trends} />

          <div className="grid gap-3 md:grid-cols-3">
            <DimensionCard title="Topics" items={trends.topics} />
            <DimensionCard
              title="Hook types"
              items={trends.hookTypes}
              renderLabel={prettyHookType}
              emptyHint="Hook types fill in as reels are analysed."
            />
            <DimensionCard
              title="Platforms"
              items={trends.platforms}
              renderLabel={(l) => platformLabel(l as never)}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="Topic momentum">
              <TrendsChart series={trends.series} />
            </Card>
            <Card title="Hooks worth stealing the shape of">
              <TopHooks hooks={trends.topHooks} />
            </Card>
          </div>
        </>
      )}
    </section>
  );
}

function HeadlineChips({ trends }: { trends: ResearchTrends }) {
  const h = trends.headline;
  const chips: { icon: ReactNode; label: string; value: string }[] = [
    {
      icon: <Flame className="size-3.5" style={{ color: "var(--oo-gold)" }} />,
      label: "Outliers in window",
      value: String(h.outlierCount),
    },
    {
      icon: <TrendingUp className="size-3.5" style={{ color: "var(--oo-gold)" }} />,
      label: "Avg outlier ratio",
      value: h.avgOutlierRatio !== null ? `${h.avgOutlierRatio.toFixed(1)}x` : "-",
    },
    {
      icon: <Heart className="size-3.5" style={{ color: "var(--oo-gold)" }} />,
      label: "Avg engagement",
      value:
        h.avgEngagementRate !== null
          ? `${(h.avgEngagementRate * 100).toFixed(1)}%`
          : "-",
    },
    {
      icon: <Sparkles className="size-3.5" style={{ color: "var(--oo-gold)" }} />,
      label: "Rising topic",
      value: h.risingTopic ?? "-",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {chips.map((c) => (
        <div
          key={c.label}
          className="flex flex-col gap-1 rounded-xl p-3"
          style={{
            background: "var(--oo-bg-elevated)",
            border: "1px solid var(--oo-border-subtle)",
          }}
        >
          <span
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider"
            style={{ color: "var(--oo-text-dim)" }}
          >
            {c.icon}
            {c.label}
          </span>
          <span
            className="truncate text-sm font-bold"
            style={{ color: "var(--oo-text-primary)" }}
            title={c.value}
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <h3
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--oo-text-dim)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function DimensionCard({
  title,
  items,
  renderLabel,
  emptyHint,
}: {
  title: string;
  items: TrendDimension[];
  renderLabel?: (label: string) => string;
  emptyHint?: string;
}) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          {emptyHint ?? "No signal yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.slice(0, 5).map((d) => (
            <li key={d.label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate text-xs font-semibold"
                  style={{ color: "var(--oo-text-primary)" }}
                  title={renderLabel ? renderLabel(d.label) : d.label}
                >
                  {renderLabel ? renderLabel(d.label) : d.label}
                </span>
                <TrendBadge dimension={d} />
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--oo-bg-hover)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${d.score}%`,
                    background: "var(--oo-gold)",
                  }}
                />
              </div>
              <span className="text-[10px]" style={{ color: "var(--oo-text-dim)" }}>
                score {d.score} · {d.sampleSize}{" "}
                {d.sampleSize === 1 ? "reel" : "reels"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TrendBadge({ dimension }: { dimension: TrendDimension }) {
  if (dimension.direction === "new") {
    return (
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
        style={{ background: "var(--oo-bg-hover)", color: "var(--oo-gold)" }}
      >
        New
      </span>
    );
  }
  const { direction, delta } = dimension;
  const color =
    direction === "up"
      ? "#7cc88a"
      : direction === "down"
        ? "var(--oo-bof)"
        : "var(--oo-text-dim)";
  const Icon =
    direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  return (
    <span
      className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums"
      style={{ color }}
      title="Change versus the previous window"
    >
      <Icon className="size-3" />
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function TopHooks({ hooks }: { hooks: TrendHook[] }) {
  if (hooks.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
        No standout hooks in this window yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {hooks.map((h, i) => (
        <li
          key={`${h.hook}-${i}`}
          className="flex flex-col gap-1 rounded-lg p-2.5"
          style={{ background: "var(--oo-bg-hover)" }}
        >
          <span
            className="flex items-start gap-1.5 text-xs leading-snug"
            style={{ color: "var(--oo-text-primary)" }}
          >
            <Quote className="mt-0.5 size-3 shrink-0" style={{ color: "var(--oo-gold)" }} />
            {h.hook}
          </span>
          <span className="flex items-center gap-2 text-[10px]" style={{ color: "var(--oo-text-dim)" }}>
            {h.hookType ? (
              <span
                className="rounded-full px-1.5 py-0.5 font-semibold"
                style={{ background: "var(--oo-bg-elevated)", color: "var(--oo-text-secondary)" }}
              >
                {prettyHookType(h.hookType)}
              </span>
            ) : null}
            <span className="tabular-nums">score {h.score}</span>
            {h.competitorUsername ? <span>@{h.competitorUsername}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div
      className="flex items-center gap-2 rounded-xl p-4 text-xs"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px dashed var(--oo-border-subtle)",
        color: "var(--oo-text-dim)",
      }}
    >
      <Eye className="size-4 shrink-0" />
      Track a few creators and analyse their reels. Once there is signal, the
      topics, hook types, and platforms working right now will surface here.
    </div>
  );
}
