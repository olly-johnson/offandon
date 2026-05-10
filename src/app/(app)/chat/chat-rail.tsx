"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

interface ConversationLink {
  id: string;
  title: string | null;
  updated_at: string;
}

interface ChatRailProps {
  conversations: ConversationLink[];
}

/**
 * Persistent left rail for the chat surface. Holds the New chat button
 * and the recent conversation list. Active highlight is derived from
 * the URL via usePathname().
 */
export function ChatRail({ conversations }: ChatRailProps) {
  const pathname = usePathname();

  return (
    <div
      className="flex w-56 shrink-0 flex-col"
      style={{
        background: "var(--oo-bg-sidebar)",
        borderRight: "1px solid var(--oo-border)",
      }}
    >
      <div className="p-3" style={{ borderBottom: "1px solid var(--oo-border)" }}>
        <Link
          href="/chat"
          className="gold-btn-outline flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs"
        >
          <Plus className="size-3.5" />
          New chat
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p
            className="py-4 text-center text-xs"
            style={{ color: "var(--oo-text-dim)" }}
          >
            No conversations yet
          </p>
        ) : (
          <>
            <p className="label-xs px-2 pb-2 pt-3">Recent</p>
            {conversations.map((c) => {
              const active = pathname === `/chat/${c.id}`;
              return (
                <Link
                  key={c.id}
                  href={`/chat/${c.id}`}
                  className="mb-0.5 block w-full truncate rounded-lg px-3 py-2 text-left text-xs"
                  style={{
                    color: active ? "var(--oo-gold)" : "var(--oo-text-dim)",
                    background: active ? "var(--oo-gold-dim)" : "transparent",
                  }}
                >
                  <span className="truncate">{c.title ?? "Untitled"}</span>
                </Link>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
