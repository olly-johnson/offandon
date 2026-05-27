import Image from "next/image";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = {
  title: "Forgot password . Bot OS",
};

export default async function ForgotPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="ABS Creative Studios"
            width={80}
            height={80}
            priority
            className="size-10 rounded-full object-cover"
            style={{ boxShadow: "var(--oo-shadow-md)" }}
          />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Bot OS</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email and we will send you a link to reset your password.
          </p>
        </header>
        <div className="rounded-lg border border-border bg-card p-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
