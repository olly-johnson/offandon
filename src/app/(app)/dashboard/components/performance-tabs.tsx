"use client";

import { useState } from "react";

interface FormatRow { label: string; value: number }
interface FunnelRow { label: "Connect" | "Nurture" | "Convert"; value: number }
interface PillarRow { label: string; value: number; color: string }

interface Props {
  format: FormatRow[];
  funnel: FunnelRow[];
  pillar: PillarRow[];
}

type Tab = "format" | "funnel" | "pillar";

export function PerformanceTabs({ format, funnel, pillar }: Props) {
  const [tab, setTab] = useState<Tab>("format");

  return (
    <div>
      <div
        className="mb-5 flex gap-0"
        style={{ borderBottom: "1px solid var(--oo-border)" }}
      >
        <button className={`bd-tab ${tab === "format" ? "active" : ""}`} onClick={() => setTab("format")}>
          Format
        </button>
        <button className={`bd-tab ${tab === "funnel" ? "active" : ""}`} onClick={() => setTab("funnel")}>
          Funnel Stage
        </button>
        <button className={`bd-tab ${tab === "pillar" ? "active" : ""}`} onClick={() => setTab("pillar")}>
          Content Pillar
        </button>
      </div>

      {tab === "format" ? <HorizontalBars rows={format} /> : null}
      {tab === "funnel" ? (
        <HorizontalBars
          rows={funnel.map((r) => ({
            label: r.label,
            value: r.value,
            color:
              r.label === "Connect"
                ? "var(--oo-tof)"
                : r.label === "Nurture"
                  ? "var(--oo-mof)"
                  : "var(--oo-bof)",
          }))}
        />
      ) : null}
      {tab === "pillar" ? <PillarDoughnut rows={pillar} /> : null}
    </div>
  );
}

function HorizontalBars({ rows }: { rows: Array<{ label: string; value: number; color?: string }> }) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) {
    return (
      <div style={{ color: "var(--oo-text-dim)", fontSize: 13, padding: "20px 0" }}>
        Not enough data yet.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-3 py-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div
            className="w-28 truncate text-xs"
            style={{ color: "var(--oo-text-secondary)" }}
            title={r.label}
          >
            {r.label}
          </div>
          <div className="relative h-6 flex-1 rounded" style={{ background: "var(--oo-bg-hover)" }}>
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{
                width: `${(r.value / max) * 100}%`,
                background: r.color ?? "var(--oo-gold)",
                minWidth: r.value > 0 ? 4 : 0,
              }}
            />
          </div>
          <div
            className="w-12 text-right font-medium tabular-nums"
            style={{ color: "var(--oo-text-primary)", fontSize: 12 }}
          >
            {r.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function PillarDoughnut({ rows }: { rows: PillarRow[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0);
  if (total === 0) {
    return (
      <div style={{ color: "var(--oo-text-dim)", fontSize: 13, padding: "20px 0" }}>
        No pillar data yet.
      </div>
    );
  }
  const r = 70;
  const sw = 22;
  const cx = 90;
  const cy = 90;
  const circ = 2 * Math.PI * r;
  const segments = rows.reduce<Array<{ row: PillarRow; len: number; offset: number }>>(
    (acc, row) => {
      const len = (row.value / total) * circ;
      const offset = acc.length === 0 ? 0 : acc[acc.length - 1].offset + acc[acc.length - 1].len;
      acc.push({ row, len, offset });
      return acc;
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-8 py-4">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--oo-border)" strokeWidth={sw + 2} />
        {segments.map(({ row, len, offset }) => (
          <circle
            key={row.label}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={row.color}
            strokeWidth={sw}
            strokeDasharray={`${Math.max(len - 2, 0)} ${circ}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 rounded-full"
              style={{ background: row.color }}
            />
            <span style={{ color: "var(--oo-text-secondary)" }}>{row.label}</span>
            <span className="tabular-nums" style={{ color: "var(--oo-text-dim)" }}>
              {Math.round((row.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
