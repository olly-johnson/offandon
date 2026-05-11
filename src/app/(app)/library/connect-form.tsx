"use client";

import { useActionState, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import {
  connectInstagramAction,
  startInstagramOAuthAction,
  type ConnectState,
} from "./actions";

interface ConnectFormProps {
  /**
   * Show the paste-a-token fallback under the OAuth button. Defaults true
   * in development; production callers should pass false (or leave the
   * server-side env gate to handle it).
   */
  allowPasteToken?: boolean;
}

export function ConnectForm({ allowPasteToken = true }: ConnectFormProps) {
  const [showPaste, setShowPaste] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <OAuthCta />

      {allowPasteToken ? (
        showPaste ? (
          <PasteTokenFallback onCancel={() => setShowPaste(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowPaste(true)}
            className="self-start text-xs underline"
            style={{ color: "var(--oo-text-dim)" }}
          >
            Or paste a token manually (dev)
          </button>
        )
      ) : null}
    </div>
  );
}

function OAuthCta() {
  const [pending, setPending] = useState(false);

  // The server action redirects; if it returns at all, the redirect was
  // intercepted by an error path and the user will see a query-string
  // message on /library. We just flip the pending state for the click
  // and let Next handle the rest.
  async function handleClick() {
    setPending(true);
    await startInstagramOAuthAction();
    setPending(false);
  }

  return (
    <form action={handleClick} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="gold-btn flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="oo-spin size-4" />
        ) : (
          <Camera className="size-4" />
        )}
        {pending ? "Redirecting to Instagram..." : "Connect with Instagram"}
      </button>
      <p
        className="text-xs leading-relaxed"
        style={{ color: "var(--oo-text-secondary)" }}
      >
        You will be redirected to Instagram to grant Bot OS read-only access to
        your posts and insights. Disconnect anytime to revoke and wipe the
        stored token.
      </p>
    </form>
  );
}

function PasteTokenFallback({ onCancel }: { onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<ConnectState, FormData>(
    connectInstagramAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="access_token" className="label-xs">
          Long-lived access token (dev only)
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs"
          style={{ color: "var(--oo-text-dim)" }}
        >
          Hide
        </button>
      </div>
      <textarea
        id="access_token"
        name="access_token"
        rows={4}
        required
        placeholder="IGAA..."
        className="oo-input resize-none font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
          Stored as is. Disconnect to wipe.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="gold-btn-outline flex items-center gap-2 px-4 py-1.5 text-xs disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="oo-spin size-3.5" />
              Connecting...
            </>
          ) : (
            "Connect with token"
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
