interface DashboardHeaderProps {
  displayName: string;
  handle: string | null;
  windowLabel: string;
}

export function DashboardHeader({ displayName, handle, windowLabel }: DashboardHeaderProps) {
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="mb-10 flex flex-wrap items-center justify-between gap-4 pb-6"
      style={{ borderBottom: "1px solid var(--oo-border)" }}
    >
      <div className="flex items-center gap-5">
        <div
          className="flex size-14 items-center justify-center rounded-full"
          style={{
            background: "var(--oo-gold-dim)",
            border: "2px solid var(--oo-gold)",
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontSize: "22px",
            fontWeight: 600,
            color: "var(--oo-gold)",
          }}
        >
          {initial}
        </div>
        <div>
          <div
            className="mb-1 text-[10px] font-bold uppercase"
            style={{ color: "var(--oo-gold)", letterSpacing: "0.22em" }}
          >
            Brand Dashboard
          </div>
          <h1
            className="bd-serif"
            style={{ fontSize: "28px", color: "var(--oo-text-primary)" }}
          >
            {displayName}
          </h1>
          {handle ? (
            <div className="mt-0.5 text-xs" style={{ color: "var(--oo-text-secondary)" }}>
              @{handle}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="text-xs"
        style={{ color: "var(--oo-text-dim)", letterSpacing: "0.04em" }}
      >
        {windowLabel}
      </div>
    </div>
  );
}
