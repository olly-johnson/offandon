import type {
  WeeklyProgress,
  WeeklyProgressMetric,
} from "@/lib/shared/weekly-progress";

interface Props {
  progress: WeeklyProgress;
}

/**
 * "Your Weekly Progress" - self-reported check-in numbers charted week
 * over week (BO-076). Renders one tile per charted metric with the latest
 * value, the delta vs last week, and a sparkline. Revenue is excluded
 * upstream by buildWeeklyProgress and never appears here.
 */
export function WeeklyProgressCard({ progress }: Props) {
  const metrics = progress.metrics.filter((m) =>
    m.series.some((p) => p.value !== null),
  );
  if (metrics.length === 0) return null;

  const weekCount = progress.weeks.length;

  return (
    <div className="oo-card-static bd-section p-6">
      <div className="bd-card-title">Your Weekly Progress</div>
      <p
        className="mb-4 text-xs"
        style={{ color: "var(--oo-text-dim)" }}
      >
        From your weekly check-ins{weekCount > 0 ? ` · last ${weekCount} weeks` : ""}.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <MetricTile key={m.key} metric={m} />
        ))}
      </div>
    </div>
  );
}

function MetricTile({ metric }: { metric: WeeklyProgressMetric }) {
  const latest = metric.latest;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--oo-text-secondary)" }}>
          {metric.label}
        </span>
        <DeltaBadge delta={metric.delta} />
      </div>
      <div
        className="mt-1 text-2xl font-bold"
        style={{
          color: "var(--oo-text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}
      >
        {latest === null ? "-" : latest.toLocaleString()}
      </div>
      <div className="mt-2">
        <Sparkline series={metric.series} />
      </div>
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat
    ? "var(--oo-text-dim)"
    : up
      ? "var(--oo-tof)"
      : "var(--oo-bof)";
  const sign = up ? "+" : "";
  const arrow = flat ? "=" : up ? "▲" : "▼";
  return (
    <span
      className="text-xs font-semibold"
      style={{ color, fontVariantNumeric: "tabular-nums" }}
    >
      {arrow} {flat ? "" : `${sign}${delta.toLocaleString()}`}
    </span>
  );
}

const SW = 120;
const SH = 32;

function Sparkline({
  series,
}: {
  series: WeeklyProgressMetric["series"];
}) {
  // Treat nulls as gaps by carrying the last value forward only for the
  // baseline; for the line we plot known points and skip nulls.
  const points = series
    .map((p, i) => ({ i, value: p.value }))
    .filter((p): p is { i: number; value: number } => p.value !== null);

  if (points.length === 0) {
    return <div style={{ height: SH }} />;
  }

  const n = series.length;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;

  const x = (i: number) => (n <= 1 ? SW / 2 : (i / (n - 1)) * SW);
  const y = (v: number) => SH - 3 - ((v - min) / span) * (SH - 6);

  const d = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"} ${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${SW} ${SH}`}
      width="100%"
      height={SH}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <path
        d={d}
        fill="none"
        stroke="var(--oo-gold)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(last.i)} cy={y(last.value)} r={2} fill="var(--oo-gold)" />
    </svg>
  );
}
