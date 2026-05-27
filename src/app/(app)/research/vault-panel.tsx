"use client";

import Link from "next/link";
import { ArrowRight, FileText, Sparkles, Trash2 } from "lucide-react";

import type { VaultListRow } from "@/engines/competitor";

import { removeFromVaultAction } from "./actions";

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
          storytelling. Save outliers to your vault, then generate scripts that
          mirror what worked in your own voice.
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
          . Saved hooks feed straight into the script generator as references.
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

  return (
    <div
      className="flex items-center gap-2 rounded-lg p-2"
      style={{
        background: "var(--oo-bg-hover)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
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
          Generate scripts that pull from your vault as references. The studio
          blends your Voice DNA with the saved hooks and structures so the
          output sounds like you, not the source creator.
          {!hasItems
            ? " Works without vault items, but sharper with concrete references."
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
