"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { startConversation, type SendState } from "./actions";

export function NewConversationForm() {
  const [state, formAction, pending] = useActionState<SendState, FormData>(
    startConversation,
    {},
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <Textarea
        name="message"
        rows={3}
        required
        disabled={pending}
        placeholder="What do you want to think through?"
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
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
