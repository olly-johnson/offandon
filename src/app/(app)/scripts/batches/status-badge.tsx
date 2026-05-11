interface Props {
  status: "pending" | "running" | "complete" | "failed";
}

const STYLES: Record<
  Props["status"],
  { label: string; bg: string; color: string; border: string }
> = {
  pending: {
    label: "Queued",
    bg: "var(--oo-bg-elevated)",
    color: "var(--oo-text-secondary)",
    border: "var(--oo-border)",
  },
  running: {
    label: "Generating",
    bg: "var(--oo-gold-dim)",
    color: "var(--oo-gold)",
    border: "var(--oo-border-gold)",
  },
  complete: {
    label: "Ready",
    bg: "rgba(22,163,74,0.08)",
    color: "var(--oo-tof)",
    border: "rgba(22,163,74,0.2)",
  },
  failed: {
    label: "Failed",
    bg: "rgba(192,57,43,0.08)",
    color: "var(--oo-bof)",
    border: "rgba(192,57,43,0.2)",
  },
};

export function StatusBadge({ status }: Props) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}
