"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { IdeaRow } from "@/engines/content/ideas-persistence";
import type { ScriptLibraryRow } from "@/engines/content/persistence";

import { IdeasTab } from "./ideas-tab";
import { LibraryTab } from "./library-tab";
import { ScriptWizard } from "./wizard";

type Tab = "create" | "library" | "ideas";

interface ScriptsTabsProps {
  libraryScripts: ScriptLibraryRow[];
  ideas: IdeaRow[];
}

export function ScriptsTabs({ libraryScripts, ideas }: ScriptsTabsProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [highlightId, setHighlightId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex" style={{ borderBottom: "1px solid var(--oo-border)" }}>
        {(["create", "library", "ideas"] as const).map((t) => (
          <TabButton
            key={t}
            active={tab === t}
            onClick={() => {
              if (t !== tab) setHighlightId(null);
              setTab(t);
            }}
          >
            {t === "create"
              ? "Create Script"
              : t === "library"
                ? "Script Library"
                : "Ideas Bank"}
          </TabButton>
        ))}
      </div>

      {tab === "create" ? (
        <ScriptWizard
          onSaved={(id) => {
            // Refresh server-rendered libraryScripts so the new row is
            // included, then jump to the Library tab and auto-open it.
            router.refresh();
            setHighlightId(id);
            setTab("library");
          }}
        />
      ) : null}
      {tab === "library" ? (
        <LibraryTab scripts={libraryScripts} highlightId={highlightId} />
      ) : null}
      {tab === "ideas" ? <IdeasTab ideas={ideas} /> : null}
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
