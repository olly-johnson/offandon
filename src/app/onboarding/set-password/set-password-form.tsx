"use client";

import { useActionState } from "react";

import { setPassword, type SetPasswordState } from "./actions";

export function SetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(
    setPassword,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--oo-text-secondary)" }}>
        Welcome, {email}. Choose a password so you can sign in next time.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="label-xs">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="oo-input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="confirm" className="label-xs">
          Confirm password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
          className="oo-input"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="gold-btn mt-2 px-5 py-2.5 text-sm disabled:opacity-50"
      >
        {pending ? "Saving..." : "Continue"}
      </button>
      {state.error ? (
        <p className="text-sm" role="alert" style={{ color: "var(--oo-bof)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
