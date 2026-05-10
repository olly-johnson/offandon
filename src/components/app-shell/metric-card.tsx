import { TrendingDown, TrendingUp } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  trend?: string;
  /** true = positive trend (green), false = negative (red), null = neutral. */
  up?: boolean | null;
  sub?: string;
}

export function MetricCard({ label, value, trend = "", up = null, sub = "" }: MetricCardProps) {
  return (
    <div className="oo-card flex flex-col gap-2 p-5">
      <div className="metric-accent" />
      <p className="label-xs">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <span className="metric-value">{value}</span>
        {up === true && trend ? (
          <span
            className="mb-1 flex items-center gap-0.5 text-xs font-bold"
            style={{ color: "var(--oo-tof)" }}
          >
            <TrendingUp className="size-3" />
            {trend}
          </span>
        ) : null}
        {up === false && trend ? (
          <span
            className="mb-1 flex items-center gap-0.5 text-xs font-bold"
            style={{ color: "var(--oo-bof)" }}
          >
            <TrendingDown className="size-3" />
            {trend}
          </span>
        ) : null}
        {up === null && trend ? (
          <span
            className="mb-0.5 text-base font-medium"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            {trend}
          </span>
        ) : null}
      </div>
      {sub ? (
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}
