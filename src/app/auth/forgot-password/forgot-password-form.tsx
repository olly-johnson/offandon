"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  requestPasswordReset,
  type ForgotPasswordState,
} from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    ForgotPasswordState,
    FormData
  >(requestPasswordReset, {});

  if (state.sent) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p style={{ color: "var(--oo-text-secondary)" }}>
          If an account exists for <strong>{state.sent}</strong>, a reset link
          is on its way. Check your inbox (and spam).
        </p>
        <Link href="/signin" className="oo-btn-ghost px-4 py-2 text-center text-sm">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Sending..." : "Send reset link"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/signin" className="underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
