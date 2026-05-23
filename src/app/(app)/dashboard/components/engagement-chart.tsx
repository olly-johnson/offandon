import type { EngagementSeriesPoint } from "@/lib/shared/dashboard-metrics";

interface Props {
  points: EngagementSeriesPoint[];
}

const W = 800;
const H = 220;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 26;

export function EngagementChart({ points }: Props) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: H, color: "var(--oo-text-dim)", fontSize: 13 }}
      >
        No engagement in the last 30 days yet.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => p.engagement), 1);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xs = (i: number) =>
    points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (points.length - 1)) * innerW;
  const ys = (v: number) => PAD_T + innerH - (v / max) * innerH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(2)} ${ys(p.engagement).toFixed(2)}`)
    .join(" ");
  const areaD = `${pathD} L ${xs(points.length - 1).toFixed(2)} ${(PAD_T + innerH).toFixed(2)} L ${xs(0).toFixed(2)} ${(PAD_T + innerH).toFixed(2)} Z`;

  // Five y-axis ticks (incl. zero)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: ys(max * r),
    label: Math.round(max * r).toLocaleString(),
  }));

  // ~8 x labels evenly spaced
  const stride = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ height: H, display: "block" }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="bd-eng-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--oo-gold)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--oo-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={t.y}
            y2={t.y}
            stroke="var(--oo-border-subtle)"
            strokeWidth={1}
          />
          <text
            x={PAD_L - 6}
            y={t.y + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--oo-text-dim)"
          >
            {t.label}
          </text>
        </g>
      ))}

      <path d={areaD} fill="url(#bd-eng-area)" />
      <path
        d={pathD}
        fill="none"
        stroke="var(--oo-gold)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle
          key={p.date}
          cx={xs(i)}
          cy={ys(p.engagement)}
          r={2.5}
          fill="var(--oo-gold)"
        >
          <title>{`${p.date}: ${p.engagement.toLocaleString()}`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        i % stride === 0 || i === points.length - 1 ? (
          <text
            key={`x-${p.date}`}
            x={xs(i)}
            y={H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--oo-text-dim)"
          >
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
