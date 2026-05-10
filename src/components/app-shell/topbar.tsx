interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-6"
      style={{
        background: "var(--oo-bg-raised)",
        borderBottom: "1px solid var(--oo-border)",
      }}
    >
      <h1 className="text-sm font-semibold" style={{ color: "var(--oo-text-primary)" }}>
        {title}
      </h1>
    </header>
  );
}
