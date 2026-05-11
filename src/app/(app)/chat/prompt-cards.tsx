"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { startConversation } from "./actions";

interface PromptCardsProps {
  prompts: string[];
}

/**
 * Suggested-prompt cards on the chat empty state. Clicking a card kicks off
 * a new conversation seeded with that prompt by invoking startConversation
 * server-side; the action handles auth, DNA check, persistence, the LLM
 * round-trip, and finally redirects to /chat/[id]. The whole click-to-reply
 * cycle is ~5 to 15 seconds, so we show a spinner on the clicked card and
 * disable the others while it's in flight.
 */
export function PromptCards({ prompts }: PromptCardsProps) {
  const [pending, startTransition] = useTransition();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick(idx: number, text: string) {
    if (pending) return;
    setActiveIdx(idx);
    setError(null);

    const fd = new FormData();
    fd.set("message", text);

    startTransition(async () => {
      const result = await startConversation({}, fd);
      // Success path is a server-side redirect, so we only land here on error.
      if (result?.error) {
        setError(result.error);
        setActiveIdx(null);
      }
    });
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {prompts.map((p, i) => {
          const isActive = activeIdx === i;
          return (
            <button
              key={p}
              type="button"
              onClick={() => handleClick(i, p)}
              disabled={pending}
              aria-busy={isActive}
              className="oo-card flex items-center gap-2 rounded-xl px-4 py-3 text-left text-xs leading-relaxed disabled:cursor-not-allowed"
              style={{
                color: "var(--oo-text-secondary)",
                opacity: pending && !isActive ? 0.5 : 1,
              }}
            >
              {isActive ? (
                <Loader2
                  className="oo-spin size-3.5 shrink-0"
                  style={{ color: "var(--oo-gold)" }}
                />
              ) : null}
              <span>{p}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs" role="alert" style={{ color: "var(--oo-bof)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
