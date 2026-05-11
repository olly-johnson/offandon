"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { connectInstagramAction, type ConnectState } from "./actions";

export function ConnectForm() {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    connectInstagramAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="access_token" className="label-xs">
        Long-lived access token
      </label>
      <textarea
        id="access_token"
        name="access_token"
        rows={4}
        required
        placeholder="EAAxxxxx..."
        className="oo-input resize-none font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          Stored as-is. Disconnect anytime to wipe it.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="gold-btn flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="oo-spin size-3.5" />
              Connecting...
            </>
          ) : (
            "Connect Instagram"
          )}
        </button>
      </div>
      {state.error ? (
        <p
          className="text-xs"
          role="alert"
          style={{ color: "var(--oo-bof)" }}
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
