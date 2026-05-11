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

  // When an idea is picked from the Ideas Bank we seed the wizard's
  // step 1 with the idea content. The id + content tuple lets us key
  // the wizard so it remounts (resetting downstream state) every time
  // a different idea is picked, instead of trying to sync state across
  // a long-running wizard.
  const [seededIdea, setSeededIdea] = useState<{ id: string; content: string } | null>(
    null,
  );

  function handleIdeaPick(idea: IdeaRow) {
    setSeededIdea({ id: idea.id, content: idea.content });
    setTab("create");
  }

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
          key={seededIdea?.id ?? "fresh"}
          seedConcept={seededIdea?.content}
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
      {tab === "ideas" ? (
        <IdeasTab ideas={ideas} onPick={handleIdeaPick} />
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
