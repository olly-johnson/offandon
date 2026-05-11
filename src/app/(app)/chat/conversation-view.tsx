"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";
import { Send } from "lucide-react";

import type { SendState } from "./actions";
import {
  MessageBubble,
  TypingIndicator,
  type ChatMessage,
} from "./chat-messages";

export type ConversationMessage = ChatMessage;

interface ConversationViewProps {
  initialMessages: ConversationMessage[];
  action: (prev: SendState, form: FormData) => Promise<SendState>;
}

/**
 * Optimistic conversation view. Renders the persisted message list from the
 * server and, on send, immediately appends a local "user" bubble plus a
 * typing-indicator assistant bubble so the user gets instant feedback while
 * the LLM round-trip (~5 to 15s) is in flight.
 *
 * useOptimistic auto-resets when the bound server action resolves, by which
 * time revalidatePath has already pushed the freshly-persisted messages back
 * down as initialMessages. There's no flicker in practice because the action
 * only resolves after both turns are persisted.
 */
export function ConversationView({
  initialMessages,
  action,
}: ConversationViewProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [optimisticMessages, addOptimistic] = useOptimistic<
    ConversationMessage[],
    ConversationMessage
  >(initialMessages, (state, msg) => [...state, msg]);

  // We're "pending" whenever the optimistic overlay has more messages than
  // the server snapshot. Drives the typing indicator and disables Send.
  const pending = optimisticMessages.length > initialMessages.length;

  // Keep the scroll glued to the bottom as messages come in.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [optimisticMessages.length]);

  async function handleSubmit(formData: FormData) {
    const message = (formData.get("message") ?? "").toString().trim();
    if (!message) return;
    setError(null);
    formRef.current?.reset();

    addOptimistic({
      id: `optimistic-user-${Date.now()}`,
      role: "user",
      content: message,
    });

    const result = await action({}, formData);
    if (result?.error) setError(result.error);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <>
      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
      >
        {optimisticMessages.length === 0 ? (
          <p
            className="text-center text-sm"
            style={{ color: "var(--oo-text-dim)" }}
          >
            No messages in this conversation yet.
          </p>
        ) : (
          optimisticMessages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))
        )}
        {pending ? <TypingIndicator /> : null}
      </div>

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
                disabled={pending}
                placeholder="Reply..."
                onKeyDown={handleKeyDown}
                className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-60"
                style={{ color: "var(--oo-text-primary)" }}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={pending}
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

