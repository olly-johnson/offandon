import type { EngagementSeriesPoint } from "@/lib/shared/dashboard-metrics";

interface Props {
  points: EngagementSeriesPoint[];
}

const W = 800;
const H = 220;
const PAD_L = 48;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 28;

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

  // The SVG stretches to the container width (preserveAspectRatio="none"),
  // which is fine for the line/area/grid but mangles SVG <text>. So the
  // geometry stays in the SVG and the axis labels are HTML on top, where
  // they render crisp in the site font and never get stretched. Because
  // the SVG maps viewBox x 0..W linearly to 0..100% width and viewBox y
  // 0..H one-to-one to H px, we can place labels with x as a percentage
  // and y in pixels.
  const xLabels = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % stride === 0 || i === points.length - 1);

  return (
    <div className="relative" style={{ width: "100%", height: H }}>
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
          <line
            key={i}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={t.y}
            y2={t.y}
            stroke="var(--oo-border-subtle)"
            strokeWidth={1}
          />
        ))}

        <path d={areaD} fill="url(#bd-eng-area)" />
        <path
          d={pathD}
          fill="none"
          stroke="var(--oo-gold)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={p.date} cx={xs(i)} cy={ys(p.engagement)} r={2.5} fill="var(--oo-gold)">
            <title>{`${p.date}: ${p.engagement.toLocaleString()}`}</title>
          </circle>
        ))}
      </svg>

      {/* Crisp HTML axis labels, positioned over the stretched SVG. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          fontSize: 11,
          color: "var(--oo-text-dim)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ticks.map((t, i) => (
          <span
            key={`y-${i}`}
            style={{
              position: "absolute",
              top: t.y,
              left: 0,
              width: PAD_L - 8,
              textAlign: "right",
              transform: "translateY(-50%)",
              lineHeight: 1,
            }}
          >
            {t.label}
          </span>
        ))}
        {xLabels.map(({ p, i }) => {
          const isFirst = i === 0;
          const isLast = i === points.length - 1;
          return (
            <span
              key={`x-${p.date}`}
              style={{
                position: "absolute",
                left: `${(xs(i) / W) * 100}%`,
                bottom: 4,
                whiteSpace: "nowrap",
                transform: isFirst
                  ? "translateX(0)"
                  : isLast
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {p.date.slice(5)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
