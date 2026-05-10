import { FUNNEL_TARGET } from "@/lib/shared/funnel";

interface FunnelChartProps {
  percent: { TOF: number; MOF: number; BOF: number };
  total: number;
}

/**
 * Lightweight SVG donut. No chart library; the data shape is fixed
 * (three slices) and a hand-rolled donut keeps the bundle lean.
 */
export function FunnelChart({ percent, total }: FunnelChartProps) {
  const colors = {
    TOF: "var(--color-primary)",
    MOF: "#10b981",
    BOF: "#ef4444",
  } as const;

  const slices = total === 0
    ? [{ stage: "empty" as const, pct: 100, color: "var(--color-muted)" }]
    : (["TOF", "MOF", "BOF"] as const).map((stage) => ({
        stage,
        pct: percent[stage],
        color: colors[stage],
      }));

  // Donut geometry: r=70, stroke=18 yields a 176x176 viewBox at 88 cx/cy.
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto size-44">
        <svg viewBox="0 0 176 176" className="-rotate-90">
          <circle
            cx="88"
            cy="88"
            r={radius}
            fill="none"
            stroke="var(--color-secondary)"
            strokeWidth="18"
          />
          {slices.map((s) => {
            const length = (s.pct / 100) * circumference;
            const offset = circumference - acc;
            const node = (
              <circle
                key={s.stage}
                cx="88"
                cy="88"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth="18"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
              />
            );
            acc += length;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {total > 0 ? (
            <>
              <span className="text-2xl font-semibold tabular-nums">
                {percent.TOF}/{percent.MOF}/{percent.BOF}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                TOF / MOF / BOF
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No data yet</span>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 text-xs">
        {(["TOF", "MOF", "BOF"] as const).map((stage) => (
          <li key={stage} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: colors[stage] }}
              />
              <span className="font-medium">{stageLabel(stage)}</span>
            </span>
            <span className="tabular-nums text-muted-foreground">
              {percent[stage]}% <span className="opacity-50">/ {FUNNEL_TARGET[stage]}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function stageLabel(stage: "TOF" | "MOF" | "BOF"): string {
  return stage === "TOF" ? "Connect" : stage === "MOF" ? "Nurture" : "Convert";
}
