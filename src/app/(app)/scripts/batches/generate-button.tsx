"use client";

import { useActionState } from "react";

import { startGeneration, type GenerateState } from "./actions";

export function GenerateButton({ disabled = false }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    async () => startGeneration(),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <button
        type="submit"
        className="gold-btn px-4 py-2 text-xs"
        disabled={pending || disabled}
      >
        {pending ? "Starting..." : "Generate this week"}
      </button>
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
