import type { DashboardMetrics } from "@/lib/shared/dashboard-metrics";

function fmt(n: number | null, opts?: { suffix?: string; decimals?: number }): string {
  if (n === null || n === undefined) return "N/A";
  const decimals = opts?.decimals ?? 0;
  const value = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString();
  return `${value}${opts?.suffix ?? ""}`;
}

export function MetricsStrip({ metrics }: { metrics: DashboardMetrics }) {
  const cells: Array<{ label: string; value: string }> = [
    { label: "Followers", value: fmt(metrics.followers) },
    { label: "Reach", value: fmt(metrics.reach) },
    { label: "New Followers", value: fmt(metrics.newFollowers) },
    { label: "Engagement", value: fmt(metrics.engagement) },
    { label: "Eng. Rate", value: fmt(metrics.engagementRate, { suffix: "%", decimals: 1 }) },
    { label: "Video Views", value: fmt(metrics.videoViews) },
    { label: "Saves", value: fmt(metrics.saves) },
    { label: "Shares", value: fmt(metrics.shares) },
  ];

  return (
    <div className="bd-section grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cells.map((c) => (
        <div key={c.label} className="bd-metric-cell">
          <div className="bd-metric-cell-label">{c.label}</div>
          <div className="bd-metric-cell-value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
