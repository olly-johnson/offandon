"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";

import { deleteConversation } from "./actions";

interface DeleteConversationButtonProps {
  conversationId: string;
  title: string | null;
}

/**
 * Small per-row trash button on the chat rail. Hidden until hover so the
 * rail stays clean. Confirms before destructive action; the server action
 * cascades messages via the FK and redirects to /chat.
 *
 * Lives in its own client component because the surrounding rail is
 * already a client component with usePathname(). Keeping the action
 * call here lets the button manage its own pending state without
 * leaking transitions into the rail's render tree.
 */
export function DeleteConversationButton({
  conversationId,
  title,
}: DeleteConversationButtonProps) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Delete conversation${title ? `: ${title}` : ""}`}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const label = title ?? "this conversation";
        if (!confirm(`Delete "${label}"? Messages will be removed too.`)) return;
        startTransition(async () => {
          await deleteConversation(conversationId);
        });
      }}
      className="inline-flex shrink-0 items-center justify-center rounded p-1 opacity-0 transition group-hover:opacity-100 hover:bg-[var(--oo-bg-elevated)] focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: "var(--oo-text-dim)" }}
    >
      <Trash2 className="size-3" />
    </button>
  );
}
