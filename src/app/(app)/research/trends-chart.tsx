import type { TrendSeries } from "@/lib/shared/research-trends";

/**
 * Compact multi-line chart of the top topics' monthly blended score
 * (0-100). Pure SVG, no client JS: the page is server-rendered and this
 * only paints static paths. Nulls (a topic with no posts that month) are
 * skipped; the line connects the points that exist.
 */

const PALETTE = ["var(--oo-gold)", "#6aa9e0", "#7cc88a", "#d98ec0"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthShort(bucket: string): string {
  const m = Number.parseInt(bucket.slice(5, 7), 10);
  return Number.isFinite(m) && m >= 1 && m <= 12 ? MONTHS[m - 1] : bucket;
}

const W = 320;
const H = 120;
const PAD_X = 8;
const PAD_Y = 10;

export function TrendsChart({ series }: { series: TrendSeries }) {
  const { buckets, topics } = series;
  const n = buckets.length;
  const hasData =
    n > 0 && topics.some((t) => t.points.some((p) => p !== null));

  if (!hasData) {
    return (
      <p
        className="rounded-lg p-3 text-xs leading-relaxed"
        style={{ background: "var(--oo-bg-hover)", color: "var(--oo-text-dim)" }}
      >
        Not enough dated outliers yet to chart a trend. As more reels sync
        with post dates, the monthly lines will fill in here.
      </p>
    );
  }

  const x = (i: number) => PAD_X + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * PAD_X));
  const y = (v: number) => PAD_Y + (1 - v / 100) * (H - 2 * PAD_Y);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {topics.map((t, i) => (
          <span
            key={t.label}
            className="flex items-center gap-1 text-[10px]"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {t.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label="Top topics blended score by month"
      >
        {/* baseline + midline */}
        <line x1={PAD_X} y1={y(0)} x2={W - PAD_X} y2={y(0)} stroke="var(--oo-border-subtle)" strokeWidth={1} />
        <line x1={PAD_X} y1={y(50)} x2={W - PAD_X} y2={y(50)} stroke="var(--oo-border-subtle)" strokeWidth={0.5} strokeDasharray="2 3" />
        {topics.map((t, ti) => {
          const color = PALETTE[ti % PALETTE.length];
          const pts = t.points
            .map((p, i) => (p === null ? null : { cx: x(i), cy: y(p) }))
            .filter((p): p is { cx: number; cy: number } => p !== null);
          const polyline = pts.map((p) => `${p.cx},${p.cy}`).join(" ");
          return (
            <g key={t.label}>
              {pts.length > 1 ? (
                <polyline
                  points={polyline}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.75}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {pts.map((p, i) => (
                <circle key={i} cx={p.cx} cy={p.cy} r={2.25} fill={color} />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="flex justify-between px-1">
        {buckets.map((b) => (
          <span key={b} className="text-[9px]" style={{ color: "var(--oo-text-dim)" }}>
            {monthShort(b)}
          </span>
        ))}
      </div>
    </div>
  );
}
