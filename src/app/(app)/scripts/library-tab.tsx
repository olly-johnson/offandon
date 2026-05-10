"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import type { ScriptLibraryRow } from "@/engines/content/persistence";

interface LibraryTabProps {
  scripts: ScriptLibraryRow[];
}

export function LibraryTab({ scripts }: LibraryTabProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ScriptLibraryRow | null>(null);

  const filtered = query
    ? scripts.filter((s) =>
        (s.title ?? s.hook ?? "").toLowerCase().includes(query.toLowerCase()),
      )
    : scripts;

  if (scripts.length === 0) {
    return (
      <div className="oo-card-static p-8 text-center">
        <p className="text-sm" style={{ color: "var(--oo-text-secondary)" }}>
          No scripts saved yet. Build one in the Create Script tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          className="oo-input max-w-xs"
          placeholder="Search scripts..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="oo-card-static overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ borderBottom: "1px solid var(--oo-border)" }}>
            <tr>
              <th className="label-xs px-5 py-3.5 text-left">Title</th>
              <th className="label-xs px-5 py-3.5 text-left">Source</th>
              <th className="label-xs px-5 py-3.5 text-left">Updated</th>
              <th className="label-xs px-5 py-3.5 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="group cursor-pointer"
                style={{ borderBottom: "1px solid var(--oo-border-subtle)" }}
                onClick={() => setOpen(s)}
              >
                <td
                  className="max-w-[320px] truncate px-5 py-3.5 font-medium"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  {s.title ?? s.hook ?? "Untitled"}
                </td>
                <td className="px-5 py-3.5">
                  <span className={s.batch_id ? "gold-tag" : "tof-tag"}>
                    {s.batch_id ? "Batch" : "Wizard"}
                  </span>
                </td>
                <td
                  className="px-5 py-3.5 text-xs"
                  style={{ color: "var(--oo-text-secondary)" }}
                >
                  {new Date(s.updated_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    className="flex items-center gap-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ color: "var(--oo-gold)" }}
                  >
                    <Eye className="size-3.5" /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-6"
            style={{
              background: "var(--oo-bg-raised)",
              border: "1px solid var(--oo-border)",
              boxShadow: "var(--oo-shadow-xl)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-base font-bold"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  {open.title ?? open.hook ?? "Untitled"}
                </h3>
                <p className="mt-1 text-xs" style={{ color: "var(--oo-text-dim)" }}>
                  {new Date(open.updated_at).toLocaleString()} · {open.status}
                </p>
              </div>
              <button
                className="oo-btn-ghost px-3 py-1.5 text-xs"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>
            {open.hook ? (
              <p
                className="mb-4 font-semibold"
                style={{ color: "var(--oo-text-primary)" }}
              >
                {open.hook}
              </p>
            ) : null}
            <pre
              className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {open.body}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
