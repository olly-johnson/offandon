"use client";

import { useActionState } from "react";

import { resetPassword, type ResetPasswordState } from "./actions";

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<
    ResetPasswordState,
    FormData
  >(resetPassword, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--oo-text-secondary)" }}>
        Signed in as {email}. Choose a new password.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="label-xs">
          New password
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
        {pending ? "Saving..." : "Update password"}
      </button>
      {state.error ? (
        <p className="text-sm" role="alert" style={{ color: "var(--oo-bof)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
