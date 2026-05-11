"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { IdeaRow } from "@/engines/content/ideas-persistence";

interface IdeasTabProps {
  ideas: IdeaRow[];
}

/**
 * Reads the user's Ideas Bank. Rows here are captured during chat via the
 * save_idea tool (source = 'chat') or, eventually, typed in manually.
 *
 * For v1 the row is informational. A follow-up will let the user push an
 * idea into the Wizard's step 1 concept field with one click; until then
 * we render the idea, its pillar (if tagged), and a deep link back to the
 * conversation that captured it.
 */
export function IdeasTab({ ideas }: IdeasTabProps) {
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
      <div className="flex gap-3">
        <input
          className="oo-input max-w-xs"
          placeholder="Search ideas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="oo-card-static overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ borderBottom: "1px solid var(--oo-border)" }}>
            <tr>
              <th className="label-xs px-5 py-3.5 text-left">Idea</th>
              <th className="label-xs px-5 py-3.5 text-left">Pillar</th>
              <th className="label-xs px-5 py-3.5 text-left">Source</th>
              <th className="label-xs px-5 py-3.5 text-left">Saved</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr
                key={i.id}
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
                      className="text-xs"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
