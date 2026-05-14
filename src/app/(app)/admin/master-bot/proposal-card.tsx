"use client";

import { useTransition } from "react";

import type { HouseProposal } from "@/engines/master-bot/persistence";

import { applyProposal, discardProposal } from "./actions";

interface Props {
  proposal: HouseProposal;
}

export function ProposalCard({ proposal }: Props) {
  const [pending, startTransition] = useTransition();

  function onApply() {
    if (pending) return;
    startTransition(async () => {
      await applyProposal(proposal.id);
    });
  }

  function onDiscard() {
    if (pending) return;
    startTransition(async () => {
      await discardProposal(proposal.id);
    });
  }

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--oo-bg)",
        border: "1px solid var(--oo-border-gold)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--oo-gold)" }}
      >
        {proposal.slice} edit
      </p>
      <p
        className="mt-1.5 text-xs leading-relaxed"
        style={{ color: "var(--oo-text-primary)" }}
      >
        {proposal.summary}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onApply}
          className="gold-btn flex-1 rounded-md px-3 py-1.5 text-[11px]"
        >
          Apply
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDiscard}
          className="gold-btn-outline rounded-md px-3 py-1.5 text-[11px]"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
