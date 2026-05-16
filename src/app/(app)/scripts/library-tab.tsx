"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Eye, Trash2 } from "lucide-react";

import type { ScriptLibraryRow } from "@/engines/content/persistence";

import { deleteScriptAction } from "./actions";

interface LibraryTabProps {
  scripts: ScriptLibraryRow[];
  /** When set, scroll to and auto-open the matching script row. */
  highlightId?: string | null;
}

export function LibraryTab({ scripts, highlightId }: LibraryTabProps) {
  const [query, setQuery] = useState("");

  // Derive the auto-open row from props instead of mirroring it via
  // setState-in-effect (which the lint rule rejects). The user can
  // close it; we track that with a separate "dismissed" id.
  const initialOpen = useMemo<ScriptLibraryRow | null>(() => {
    if (!highlightId) return null;
    return scripts.find((s) => s.id === highlightId) ?? null;
  }, [highlightId, scripts]);

  const [dismissedHighlightId, setDismissedHighlightId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<ScriptLibraryRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  const open: ScriptLibraryRow | null =
    manualOpen ??
    (initialOpen && initialOpen.id !== dismissedHighlightId ? initialOpen : null);

  function closeOpen() {
    if (manualOpen) {
      setManualOpen(null);
    } else if (initialOpen) {
      setDismissedHighlightId(initialOpen.id);
    }
  }

  function handleDelete(scriptId: string) {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteScriptAction(scriptId);
      if ("error" in res) {
        setDeleteError(res.error);
        return;
      }
      setConfirmDeleteId(null);
      // If the row was open in the viewer, close it.
      if (manualOpen?.id === scriptId) setManualOpen(null);
      if (initialOpen?.id === scriptId) setDismissedHighlightId(scriptId);
    });
  }

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // After the highlighted row mounts, smooth-scroll it into view. The
  // effect only does DOM work; no state writes.
  useEffect(() => {
    if (!highlightId) return;
    requestAnimationFrame(() => {
      highlightRowRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    });
  }, [highlightId]);

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

      {deleteError ? (
        <div
          className="rounded-lg px-4 py-2 text-xs"
          style={{
            background: "color-mix(in srgb, var(--destructive) 12%, transparent)",
            color: "var(--destructive)",
            border: "1px solid var(--destructive)",
          }}
        >
          {deleteError}
        </div>
      ) : null}

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
            {filtered.map((s) => {
              const isHighlight = s.id === highlightId;
              return (
              <tr
                key={s.id}
                ref={isHighlight ? highlightRowRef : null}
                className="group cursor-pointer"
                style={{
                  borderBottom: "1px solid var(--oo-border-subtle)",
                  background: isHighlight ? "var(--oo-gold-dim)" : undefined,
                }}
                onClick={() => setManualOpen(s)}
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
                  {s.updated_at.slice(0, 10)}
                </td>
                <td className="px-5 py-3.5">
                  <div
                    className="flex items-center justify-end gap-3 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "var(--oo-gold)" }}
                      onClick={() => setManualOpen(s)}
                    >
                      <Eye className="size-3.5" /> View
                    </button>
                    {confirmDeleteId === s.id ? (
                      <>
                        <button
                          className="text-xs"
                          style={{ color: "var(--destructive)" }}
                          disabled={isDeleting}
                          onClick={() => handleDelete(s.id)}
                        >
                          {isDeleting ? "Deleting..." : "Confirm delete"}
                        </button>
                        <button
                          className="text-xs"
                          style={{ color: "var(--oo-text-secondary)" }}
                          disabled={isDeleting}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-xs"
                        style={{ color: "var(--oo-text-secondary)" }}
                        aria-label="Delete script"
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmDeleteId(s.id);
                        }}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={closeOpen}
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
                  {open.updated_at.slice(0, 16).replace("T", " ")} · {open.status}
                </p>
              </div>
              <button
                className="oo-btn-ghost px-3 py-1.5 text-xs"
                onClick={closeOpen}
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
