"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { startConversation } from "./actions";
import {
  MessageBubble,
  TypingIndicator,
  type ChatMessage,
} from "./chat-messages";

interface ChatHomeProps {
  /** Prompts seeded from the user's Voice DNA pillars. */
  prompts: string[];
}

/**
 * The /chat empty-state page. Two visual modes share the same client
 * component so that submitting a message gives instant feedback rather
 * than freezing the welcome screen for the 5-to-15-second LLM round-trip.
 *
 *   Welcome mode   (no optimistic messages yet)
 *     Centered O, greeting, suggested-prompt cards.
 *
 *   Sending mode   (optimistic message in flight)
 *     Conversation-shaped message list: the user's bubble + a typing
 *     indicator. startConversation then redirects to /chat/[id], where
 *     ConversationView takes over.
 *
 * useOptimistic isn't needed for state correctness here because
 * startConversation always redirects on success, so the optimistic
 * overlay only ever lives until navigation. But it's still the right
 * primitive because React will discard it cleanly if the action errors
 * (we fall back to welcome mode + an inline error).
 */
export function ChatHome({ prompts }: ChatHomeProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [optimisticMessages, addOptimistic] = useOptimistic<
    ChatMessage[],
    ChatMessage
  >([], (state, msg) => [...state, msg]);

  const sending = optimisticMessages.length > 0;

  useEffect(() => {
    if (!sending) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [sending, optimisticMessages.length]);

  async function send(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return;
    setError(null);

    addOptimistic({
      id: `optimistic-user-${Date.now()}`,
      role: "user",
      content: trimmed,
    });

    const fd = new FormData();
    fd.set("message", trimmed);
    const result = await startConversation({}, fd);
    // Success: server-side redirect already fired; we never reach here.
    if (result?.error) setError(result.error);
  }

  async function handleSubmit(formData: FormData) {
    const message = (formData.get("message") ?? "").toString();
    formRef.current?.reset();
    await send(message);
  }

  function handleCardClick(prompt: string) {
    void send(prompt);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <>
      {sending ? (
        <div
          ref={listRef}
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
        >
          {optimisticMessages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          <TypingIndicator />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
          <div
            className="flex size-12 items-center justify-center rounded-full text-lg font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
            }}
          >
            O
          </div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            How can I help you today?
          </p>
          <PromptCards prompts={prompts} onPick={handleCardClick} />
        </div>
      )}

      <div
        className="p-4"
        style={{
          borderTop: "1px solid var(--oo-border)",
          background: "var(--oo-bg)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <form
            ref={formRef}
            action={handleSubmit}
            className="flex flex-col gap-2"
          >
            <div
              className="flex items-end gap-3 rounded-xl p-3"
              style={{
                background: "var(--oo-bg-raised)",
                border: "1px solid var(--oo-border)",
                boxShadow: "var(--oo-card-shadow)",
              }}
            >
              <textarea
                name="message"
                rows={1}
                required
                disabled={sending}
                placeholder="Ask anything..."
                onKeyDown={handleKeyDown}
                className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-60"
                style={{ color: "var(--oo-text-primary)" }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={sending}
                className="gold-btn flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <Send className="size-3.5" />
              </button>
            </div>
            {error ? (
              <p
                className="text-xs"
                role="alert"
                style={{ color: "var(--oo-bof)" }}
              >
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </>
  );
}

function PromptCards({
  prompts,
  onPick,
}: {
  prompts: string[];
  onPick: (prompt: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  function handleClick(idx: number, text: string) {
    if (activeIdx !== null) return;
    setActiveIdx(idx);
    onPick(text);
  }

  return (
    <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
      {prompts.map((p, i) => {
        const isActive = activeIdx === i;
        const otherActive = activeIdx !== null && !isActive;
        return (
          <button
            key={p}
            type="button"
            onClick={() => handleClick(i, p)}
            disabled={activeIdx !== null}
            aria-busy={isActive}
            className="oo-card flex items-center gap-2 rounded-xl px-4 py-3 text-left text-xs leading-relaxed disabled:cursor-not-allowed"
            style={{
              color: "var(--oo-text-secondary)",
              opacity: otherActive ? 0.5 : 1,
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
  );
}
