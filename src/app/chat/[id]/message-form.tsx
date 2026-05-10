"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { sendMessage, type SendState } from "../actions";

export function MessageForm({ conversationId }: { conversationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState<SendState, FormData>(
    (prev, form) => sendMessage(conversationId, prev, form),
    {},
  );

  // Clear the textarea once the action settles without an error so the user
  // can immediately type the next message. useActionState does not reset
  // form fields on success; resetting here is the standard escape hatch.
  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <Textarea
        name="message"
        rows={3}
        required
        disabled={pending}
        placeholder="Reply..."
      />
      <div className="flex items-center justify-between gap-3">
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Thinking…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
