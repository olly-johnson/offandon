import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { SetPasswordForm } from "./set-password-form";

const log = createLogger("page.set-password");

export const metadata = {
  title: "Set a password · Bot OS",
};

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // If they already have a profile they have already completed onboarding;
  // skip the set-password step so this page is idempotent for stragglers.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) {
    log.debug("profile exists, skipping to dashboard", { user_id: user.id });
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Bot OS</h1>
          <p className="mt-2 text-sm text-muted-foreground">First, set a password.</p>
        </header>
        <div className="rounded-lg border border-border bg-card p-6">
          <SetPasswordForm email={user.email ?? "your email"} />
        </div>
      </div>
    </main>
  );
}
