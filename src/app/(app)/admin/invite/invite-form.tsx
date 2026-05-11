"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";

import { inviteUserAction, type InviteState } from "./actions";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    async (prev, fd) => {
      const next = await inviteUserAction(prev, fd);
      if (next.sent) setEmail("");
      return next;
    },
    {},
  );

  const justSent = !pending && state.sent;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="invite-email" className="text-xs uppercase tracking-wide text-muted-foreground">
        Email
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="invite-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="creator@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="oo-input min-w-64 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending || email.length === 0}
          className="gold-btn flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="oo-spin size-3.5" />
              Sending...
            </>
          ) : (
            <>
              <Send className="size-3.5" />
              Send invite
            </>
          )}
        </button>
      </div>

      {justSent ? (
        <p
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--oo-tof)" }}
          role="status"
        >
          <Check className="size-3.5" />
          Invite sent to {state.sent}.
        </p>
      ) : null}

      {state.error ? (
        <p className="text-xs" role="alert" style={{ color: "var(--oo-bof)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
