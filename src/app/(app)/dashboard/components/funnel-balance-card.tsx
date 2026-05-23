import { FUNNEL_TARGET } from "@/lib/shared/funnel";

import { FunnelChart } from "../funnel-chart";

interface Props {
  percent: { TOF: number; MOF: number; BOF: number };
  total: number;
}

export function FunnelBalanceCard({ percent, total }: Props) {
  return (
    <div className="oo-card-static p-6">
      <div className="bd-card-title">Trust Funnel Balance</div>
      <div className="grid items-center gap-6 md:grid-cols-2">
        <div className="flex justify-center">
          <FunnelChart percent={percent} total={total} />
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <Row
            color="var(--oo-tof)"
            label="Connect"
            pct={total === 0 ? null : percent.TOF}
          />
          <Row
            color="var(--oo-mof)"
            label="Nurture"
            pct={total === 0 ? null : percent.MOF}
          />
          <Row
            color="var(--oo-bof)"
            label="Convert"
            pct={total === 0 ? null : percent.BOF}
          />
          <div
            className="mt-3 text-[11px]"
            style={{ color: "var(--oo-text-dim)" }}
          >
            Target: {FUNNEL_TARGET.TOF}% / {FUNNEL_TARGET.MOF}% / {FUNNEL_TARGET.BOF}%
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ color, label, pct }: { color: string; label: string; pct: number | null }) {
  return (
    <div
      className="flex items-center justify-between py-2"
      style={{ borderBottom: "1px solid var(--oo-border-subtle)" }}
    >
      <span className="flex items-center gap-2" style={{ color: "var(--oo-text-secondary)" }}>
        <span className="size-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{ color: "var(--oo-text-primary)", fontWeight: 500 }}
      >
        {pct === null ? "N/A" : `${pct}%`}
      </span>
    </div>
  );
}
