"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wand2 } from "lucide-react";

import type { IdeaRow } from "@/engines/content/ideas-persistence";

interface IdeasTabProps {
  ideas: IdeaRow[];
  /**
   * Called when the user clicks an idea row. The parent uses this to seed
   * the Script Wizard's step 1 and switch to the Create Script tab.
   */
  onPick?: (idea: IdeaRow) => void;
}

/**
 * Reads the user's Ideas Bank. Rows here are captured during chat via the
 * save_idea tool (source = 'chat') or, eventually, typed in manually.
 *
 * Click any row to drop the idea into the Script Wizard as the seed
 * concept. The "from chat" deep-link stops propagation so it can still
 * navigate to the originating conversation without first hijacking the
 * pick.
 */
export function IdeasTab({ ideas, onPick }: IdeasTabProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return ideas;
    return ideas.filter(
      (i) =>
        i.content.toLowerCase().includes(q) ||
        (i.pillar ?? "").toLowerCase().includes(q),
    );
  }, [ideas, query]);

  if (ideas.length === 0) {
    return (
      <div className="oo-card-static p-8 text-center">
        <span className="gold-tag mb-4">Ideas Bank</span>
        <h2
          className="text-xl font-semibold tracking-tight"
          style={{ color: "var(--oo-text-primary)" }}
        >
          No ideas saved yet
        </h2>
        <p
          className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          During chat, say &ldquo;save that as an idea&rdquo; and the assistant
          will drop it here. You can then turn ideas into scripts in one click.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <input
          className="oo-input max-w-xs"
          placeholder="Search ideas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          Click any idea to seed a new script.
        </p>
      </div>

      <div className="oo-card-static overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ borderBottom: "1px solid var(--oo-border)" }}>
            <tr>
              <th className="label-xs px-5 py-3.5 text-left">Idea</th>
              <th className="label-xs px-5 py-3.5 text-left">Pillar</th>
              <th className="label-xs px-5 py-3.5 text-left">Source</th>
              <th className="label-xs px-5 py-3.5 text-left">Saved</th>
              <th className="label-xs px-5 py-3.5 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr
                key={i.id}
                onClick={() => onPick?.(i)}
                className="group cursor-pointer"
                style={{ borderBottom: "1px solid var(--oo-border-subtle)" }}
              >
                <td
                  className="px-5 py-3.5"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  <p className="leading-relaxed">{i.content}</p>
                </td>
                <td className="px-5 py-3.5">
                  {i.pillar ? (
                    <span className="gold-tag">{i.pillar}</span>
                  ) : (
                    <span
                      className="text-xs"
                      style={{ color: "var(--oo-text-dim)" }}
                    >
                      n/a
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {i.source === "chat" && i.conversation_id ? (
                    <Link
                      href={`/chat/${i.conversation_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs hover:underline"
                      style={{ color: "var(--oo-gold)" }}
                    >
                      from chat
                    </Link>
                  ) : (
                    <span
                      className="text-xs"
                      style={{ color: "var(--oo-text-dim)" }}
                    >
                      {i.source}
                    </span>
                  )}
                </td>
                <td
                  className="px-5 py-3.5 text-xs"
                  style={{ color: "var(--oo-text-secondary)" }}
                >
                  {new Date(i.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--oo-gold)" }}
                  >
                    <Wand2 className="size-3.5" /> Use
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
