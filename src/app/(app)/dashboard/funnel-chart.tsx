/**
 * Trust Funnel donut. Geometry mirrors the reference design in
 * examples/components/atoms/TrustChart.tsx so the surface feels
 * consistent if the reference codebase is later imported wholesale.
 */
export function FunnelChart({
  percent,
  total,
}: {
  percent: { TOF: number; MOF: number; BOF: number };
  total: number;
}) {
  const tof = total === 0 ? 0 : percent.TOF;
  const mof = total === 0 ? 0 : percent.MOF;
  const bof = total === 0 ? 0 : percent.BOF;

  const r = 68;
  const cx = 88;
  const cy = 88;
  const sw = 22;
  const circ = 2 * Math.PI * r;
  const gap = 5;
  const safeTotal = tof + mof + bof || 100;
  const c1 = (tof / safeTotal) * circ;
  const c2 = (mof / safeTotal) * circ;
  const c3 = (bof / safeTotal) * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="176" height="176" viewBox="0 0 176 176">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--oo-border)"
          strokeWidth={sw + 4}
        />
        {total > 0 ? (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--oo-tof)"
              strokeWidth={sw}
              strokeDasharray={`${Math.max(c1 - gap, 0)} ${circ}`}
              strokeDashoffset={0}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--oo-mof)"
              strokeWidth={sw}
              strokeDasharray={`${Math.max(c2 - gap, 0)} ${circ}`}
              strokeDashoffset={-c1}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--oo-bof)"
              strokeWidth={sw}
              strokeDasharray={`${Math.max(c3 - gap, 0)} ${circ}`}
              strokeDashoffset={-(c1 + c2)}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          </>
        ) : null}
        <circle cx={cx} cy={cy} r={r - sw / 2 - 4} fill="var(--oo-bg-raised)" />
        {total > 0 ? (
          <>
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fill="var(--oo-text-primary)"
              fontSize="19"
              fontWeight="700"
            >
              {tof}/{mof}
            </text>
            <text
              x={cx}
              y={cy + 13}
              textAnchor="middle"
              fill="var(--oo-text-dim)"
              fontSize="12"
            >
              /{bof} split
            </text>
          </>
        ) : (
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            fill="var(--oo-text-dim)"
            fontSize="12"
          >
            No data yet
          </text>
        )}
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {[
          { color: "var(--oo-tof)", label: `Connect ${tof}%` },
          { color: "var(--oo-mof)", label: `Nurture ${mof}%` },
          { color: "var(--oo-bof)", label: `Convert ${bof}%` },
        ].map((s) => (
          <span
            key={s.label}
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
