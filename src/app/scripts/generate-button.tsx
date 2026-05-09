"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { startGeneration, type GenerateState } from "./actions";

export function GenerateButton({ disabled = false }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    async () => startGeneration(),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" disabled={pending || disabled}>
        {pending ? "Starting…" : "Generate this week"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
