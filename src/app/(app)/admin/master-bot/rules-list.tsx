"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import type { MethodologyRule } from "@/engines/master-bot/persistence";
import type { MethodologySlice } from "@/lib/shared/methodology";

import { deleteRuleAction } from "./actions";

interface Props {
  rules: MethodologyRule[];
}

const SLICE_ORDER: MethodologySlice[] = ["house", "chat", "scripts", "analyst"];

export function RulesList({ rules }: Props) {
  const [pending, startTransition] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const groups: Record<MethodologySlice, MethodologyRule[]> = {
    house: [],
    chat: [],
    scripts: [],
    analyst: [],
  };
  for (const r of rules) groups[r.slice].push(r);

  function onDelete(id: string) {
    if (pending) return;
    setRemovingId(id);
    startTransition(async () => {
      await deleteRuleAction(id);
      setRemovingId(null);
    });
  }

  return (
    <div>
      <h3
        className="mb-2 text-xs font-bold uppercase tracking-wide"
        style={{ color: "var(--oo-text-dim)" }}
      >
        Active rules
      </h3>
      {rules.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          No rules yet. Ask the bot to add one.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {SLICE_ORDER.map((slice) => {
            const rs = groups[slice];
            if (rs.length === 0) return null;
            return (
              <div key={slice}>
                <p
                  className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--oo-gold)" }}
                >
                  {slice} ({rs.length})
                </p>
                <ul className="flex flex-col gap-1.5">
                  {rs.map((r) => (
                    <li
                      key={r.id}
                      className="group flex items-start justify-between gap-2 rounded-md p-2 text-xs"
                      style={{
                        background: "var(--oo-bg)",
                        border: "1px solid var(--oo-border-subtle)",
                        opacity: removingId === r.id ? 0.5 : 1,
                      }}
                    >
                      <span
                        className="leading-relaxed"
                        style={{ color: "var(--oo-text-secondary)" }}
                      >
                        {r.rule}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        disabled={pending}
                        aria-label="Delete rule"
                        className="oo-rule-delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
