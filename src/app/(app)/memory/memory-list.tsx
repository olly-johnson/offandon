"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";

import type { MemoryRow } from "@/engines/memory/persistence";

import { deleteMemoryAction, type DeleteMemoryState } from "./actions";

interface MemoryListProps {
  memories: MemoryRow[];
  categoryLabels: Record<string, string>;
}

const CATEGORY_ORDER: MemoryRow["category"][] = [
  "ongoing_project",
  "creator_context",
  "preference",
  "recent_topic",
];

export function MemoryList({ memories, categoryLabels }: MemoryListProps) {
  if (memories.length === 0) {
    return (
      <div className="oo-card-static p-8 text-center">
        <p className="text-sm" style={{ color: "var(--oo-text-secondary)" }}>
          Nothing remembered yet. Have a few chats; the assistant pulls
          durable facts in the background.
        </p>
      </div>
    );
  }

  const grouped = new Map<MemoryRow["category"], MemoryRow[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const m of memories) grouped.get(m.category)?.push(m);

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((cat) => {
        const rows = grouped.get(cat) ?? [];
        if (rows.length === 0) return null;
        return (
          <section key={cat}>
            <h3 className="label-xs mb-2">{categoryLabels[cat] ?? cat}</h3>
            <ul className="oo-card-static divide-y" style={{ borderColor: "var(--oo-border)" }}>
              {rows.map((m) => (
                <MemoryRowItem key={m.id} memory={m} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function MemoryRowItem({ memory }: { memory: MemoryRow }) {
  const action = deleteMemoryAction.bind(null, memory.id);
  const [state, formAction, pending] = useActionState<DeleteMemoryState, FormData>(
    action,
    {},
  );

  return (
    <li
      className="flex items-start gap-4 px-5 py-3.5"
      style={{ borderColor: "var(--oo-border-subtle)" }}
    >
      <div className="flex-1">
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-primary)" }}
        >
          {memory.fact}
        </p>
        <p
          className="mt-1 text-xs"
          style={{ color: "var(--oo-text-dim)" }}
        >
          priority {memory.priority} . saved{" "}
          {memory.created_at.slice(0, 10)}
        </p>
        {state.error ? (
          <p
            className="mt-1 text-xs"
            role="alert"
            style={{ color: "var(--oo-bof)" }}
          >
            {state.error}
          </p>
        ) : null}
      </div>
      <form action={formAction}>
        <button
          type="submit"
          aria-label="Delete memory"
          disabled={pending}
          className="rounded-lg p-1.5 transition-colors disabled:opacity-50"
          style={{ color: "var(--oo-text-dim)" }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </form>
    </li>
  );
}
