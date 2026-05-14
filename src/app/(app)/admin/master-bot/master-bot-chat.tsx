"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";

import { AutoGrowTextarea } from "@/app/(app)/chat/auto-grow-textarea";
import {
  MessageBubble,
  TypingIndicator,
  type ChatMessage,
} from "@/app/(app)/chat/chat-messages";

import { sendMasterBotMessage } from "./actions";

interface Props {
  initialMessages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}

export function MasterBotChat({ initialMessages }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initial: ChatMessage[] = initialMessages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));
  const [optimisticMessages, addOptimistic] = useOptimistic<ChatMessage[], ChatMessage>(
    initial,
    (state, msg) => [...state, msg],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [optimisticMessages.length, pending]);

  function handleSubmit(formData: FormData) {
    const text = (formData.get("message") ?? "").toString().trim();
    if (!text) return;
    setError(null);
    formRef.current?.reset();
    startTransition(async () => {
      addOptimistic({
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: text,
      });
      const result = await sendMasterBotMessage({}, formData);
      if (result?.error) setError(result.error);
    });
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
          <div
            className="m-auto max-w-md rounded-xl p-6 text-center"
            style={{ background: "var(--oo-bg-raised)", border: "1px solid var(--oo-border)" }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              Master Bot
            </p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--oo-text-dim)" }}>
              Tell it how you want the bots to behave. It can add a short rule
              under a specific slice or propose a structural change to the house
              methodology. Proposals appear on the right; you click Apply or
              Discard.
            </p>
            <p className="mt-3 text-[11px]" style={{ color: "var(--oo-text-dim)" }}>
              Example: &quot;Never recommend pricing tactics.&quot; or &quot;Teach the script
              writer about the Russian Doll structure.&quot;
            </p>
          </div>
        ) : (
          optimisticMessages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))
        )}
        {pending ? <TypingIndicator /> : null}
      </div>

      <div
        className="p-4"
        style={{ borderTop: "1px solid var(--oo-border)", background: "var(--oo-bg)" }}
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
              <AutoGrowTextarea
                name="message"
                rows={1}
                required
                disabled={pending}
                placeholder="Ask the Master Bot to add or change a rule..."
                onKeyDown={handleKeyDown}
                className="max-h-48 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none disabled:opacity-60"
                style={{ color: "var(--oo-text-primary)" }}
              />
              <button
                type="submit"
                aria-label="Send"
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
