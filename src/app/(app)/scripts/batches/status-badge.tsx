interface Props {
  status: "pending" | "running" | "complete" | "failed";
}

const STYLES: Record<Props["status"], { label: string; className: string }> = {
  pending: {
    label: "Queued",
    className: "border-border text-muted-foreground",
  },
  running: {
    label: "Generating",
    className: "border-primary text-primary",
  },
  complete: {
    label: "Ready",
    className: "border-primary bg-primary/10 text-primary",
  },
  failed: {
    label: "Failed",
    className: "border-destructive text-destructive",
  },
};

export function StatusBadge({ status }: Props) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${s.className}`}
    >
      {s.label}
    </span>
  );
}
