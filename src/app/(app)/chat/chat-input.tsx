"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send } from "lucide-react";

import type { SendState } from "./actions";

type ChatAction = (prev: SendState, form: FormData) => Promise<SendState>;

interface ChatInputProps {
  action: ChatAction;
  placeholder?: string;
  /** Reset the textarea after a successful submit. Off for new-conversation flows that redirect. */
  resetOnSuccess?: boolean;
}

/**
 * Single chat input bar shared by the empty state (start a conversation)
 * and the conversation thread (continue). Same visual; the parent picks
 * the action.
 */
export function ChatInput({
  action,
  placeholder = "Ask anything...",
  resetOnSuccess = false,
}: ChatInputProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [state, formAction, pending] = useActionState<SendState, FormData>(
    action,
    {},
  );

  // useActionState does not reset form fields. Reset manually after a
  // successful settle so the user can immediately type the next turn.
  useEffect(() => {
    if (resetOnSuccess && !pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error, resetOnSuccess]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <div
        className="flex items-end gap-3 rounded-xl p-3"
        style={{
          background: "var(--oo-bg-raised)",
          border: "1px solid var(--oo-border)",
          boxShadow: "var(--oo-card-shadow)",
        }}
      >
        <textarea
          ref={textareaRef}
          name="message"
          rows={1}
          required
          disabled={pending}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
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
      {state.error ? (
        <p className="text-xs" style={{ color: "var(--oo-bof)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
