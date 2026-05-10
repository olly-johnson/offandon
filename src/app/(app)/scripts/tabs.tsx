"use client";

import { useState } from "react";

import type { ScriptLibraryRow } from "@/engines/content/persistence";

import { LibraryTab } from "./library-tab";
import { ScriptWizard } from "./wizard";

type Tab = "create" | "library" | "ideas";

interface ScriptsTabsProps {
  libraryScripts: ScriptLibraryRow[];
}

export function ScriptsTabs({ libraryScripts }: ScriptsTabsProps) {
  const [tab, setTab] = useState<Tab>("create");

  return (
    <div className="space-y-5">
      <div className="flex" style={{ borderBottom: "1px solid var(--oo-border)" }}>
        {(["create", "library", "ideas"] as const).map((t) => (
          <TabButton key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === "create"
              ? "Create Script"
              : t === "library"
                ? "Script Library"
                : "Ideas Bank"}
          </TabButton>
        ))}
      </div>

      {tab === "create" ? <ScriptWizard /> : null}
      {tab === "library" ? <LibraryTab scripts={libraryScripts} /> : null}
      {tab === "ideas" ? (
        <div className="oo-card-static p-8 text-center">
          <span className="gold-tag mb-4">Coming soon</span>
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ color: "var(--oo-text-primary)" }}
          >
            Ideas Bank
          </h2>
          <p
            className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            Save raw ideas during chat with &ldquo;save that as an idea&rdquo;, then turn them
            into scripts in one click.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-all"
      style={{
        color: active ? "var(--oo-gold)" : "var(--oo-text-secondary)",
        borderBottom: active ? "2px solid var(--oo-gold)" : "2px solid transparent",
        marginBottom: "-1px",
        fontWeight: active ? 600 : 500,
        background: "transparent",
      }}
    >
      {children}
    </button>
  );
}
