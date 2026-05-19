import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Reset password . Bot OS",
};

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin?error=expired-link");

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <header className="flex flex-col items-center text-center">
          <div
            className="flex size-12 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
              boxShadow: "var(--oo-shadow-md)",
            }}
          >
            O
          </div>
          <h1
            className="mt-4 text-2xl font-bold"
            style={{
              color: "var(--oo-text-primary)",
              letterSpacing: "-0.02em",
            }}
          >
            Bot OS
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            Reset your password.
          </p>
        </header>
        <div className="oo-card-static p-6">
          <ResetPasswordForm email={user.email ?? "your email"} />
        </div>
      </div>
    </main>
  );
}
