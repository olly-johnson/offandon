"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, Loader2, Sparkles, Trash2, Wand2 } from "lucide-react";

import type { VaultListRow } from "@/engines/competitor";

import {
  generateIdeasFromOutlierAction,
  removeFromVaultAction,
  type GenerateIdeasState,
} from "./actions";

interface VaultPanelProps {
  items: VaultListRow[];
}

export function VaultPanel({ items }: VaultPanelProps) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--oo-gold)" }}
        >
          Step 4
        </span>
        <h2
          className="text-2xl font-bold"
          style={{
            color: "var(--oo-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Write Winning Short-Form Scripts
        </h2>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          Develop winning ideas into your own unique scripts, using data-backed
          storytelling. Save outliers to your vault, then turn any one into 3
          ideas in your own voice, about your own stories, that mirror its
          hook and structure. Ideas land in your Ideas Bank, ready to script.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <VaultCard items={items} />
        <ScriptStudioCard hasItems={items.length > 0} />
      </div>
    </section>
  );
}

function VaultCard({ items }: { items: VaultListRow[] }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles
          className="size-3.5"
          style={{ color: "var(--oo-gold)" }}
        />
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--oo-text-primary)" }}
        >
          Vault
        </h3>
        <span
          className="ml-auto text-[10px]"
          style={{ color: "var(--oo-text-dim)" }}
        >
          {items.length} saved
        </span>
      </div>

      {items.length === 0 ? (
        <p
          className="rounded-lg p-3 text-xs leading-relaxed"
          style={{
            background: "var(--oo-bg-hover)",
            color: "var(--oo-text-dim)",
          }}
        >
          Find an outlier in Step 2, open the drill-in, and click{" "}
          <span style={{ color: "var(--oo-text-secondary)" }}>
            Save to vault
          </span>
          . Then turn any saved outlier into 3 ideas in your own voice with one
          click, ready to develop into scripts.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <VaultRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VaultRow({ item }: { item: VaultListRow }) {
  const meta = item.metadata;
  const competitorId = meta.competitor_id;
  const mediaId = meta.media_id;

  const [state, formAction, pending] = useActionState<GenerateIdeasState, FormData>(
    generateIdeasFromOutlierAction,
    {},
  );

  return (
    <div
      className="flex flex-col gap-2 rounded-lg p-2"
      style={{
        background: "var(--oo-bg-hover)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/research/${competitorId}/${mediaId}`}
          className="flex min-w-0 flex-1 items-center gap-2 hover:opacity-90"
          title={item.title}
        >
          <FileText
            className="size-3.5 shrink-0"
            style={{ color: "var(--oo-gold)" }}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className="truncate text-xs font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {item.title}
            </span>
            <span
              className="text-[10px]"
              style={{ color: "var(--oo-text-dim)" }}
            >
              @{meta.competitor_username}
            </span>
          </span>
        </Link>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            background: "var(--oo-bg-elevated)",
            color: "var(--oo-text-secondary)",
          }}
          title="Views at save time"
        >
          {formatCount(meta.view_count)}
        </span>
        <form action={removeFromVaultAction}>
          <input type="hidden" name="media_id" value={mediaId} />
          <button
            type="submit"
            aria-label={`Remove ${item.title} from vault`}
            title="Remove from vault"
            className="oo-icon-btn rounded p-1 opacity-60 hover:opacity-100"
          >
            <Trash2 className="size-3" />
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="media_id" value={mediaId} />
          <button
            type="submit"
            disabled={pending}
            className="oo-soft-btn inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
            style={{
              background: "var(--oo-bg-elevated)",
              border: "1px solid var(--oo-border-subtle)",
              color: "var(--oo-gold)",
            }}
            title="Write 3 ideas in your voice using this outlier's pattern"
          >
            {pending ? (
              <>
                <Loader2 className="oo-spin size-3" />
                Generating
              </>
            ) : (
              <>
                <Wand2 className="size-3" />
                Generate 3 ideas
              </>
            )}
          </button>
        </form>
        {state.ok ? (
          <Link
            href="/scripts"
            className="inline-flex items-center gap-1 text-[11px] hover:underline"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            {state.count ?? 3} ideas added to your Ideas Bank
            <ArrowRight className="size-3" />
          </Link>
        ) : state.error ? (
          <span className="text-[11px]" role="alert" style={{ color: "var(--oo-bof)" }}>
            {state.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ScriptStudioCard({ hasItems }: { hasItems: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <FileText
            className="size-3.5"
            style={{ color: "var(--oo-gold)" }}
          />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--oo-text-primary)" }}
          >
            Script Studio
          </h3>
        </div>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          Ideas you generate from saved outliers land in your Ideas Bank. Open
          the Script Studio to develop any idea into a full script in your
          voice.
          {!hasItems
            ? " Generate some ideas from your vault first for the sharpest starting point."
            : ""}
        </p>
      </div>
      <Link
        href="/scripts"
        className="gold-btn inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs"
      >
        Open Script Studio
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

function formatCount(n: number | null): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
