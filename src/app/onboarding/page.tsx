import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { OnboardingWizard } from "./wizard";

const log = createLogger("page.onboarding");

export const metadata = {
  title: "Onboarding · Bot OS",
};

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // If a profile already exists, onboarding is done.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile) {
    log.debug("profile exists, redirecting to /dashboard", { user_id: user.id });
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Bot OS onboarding</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Three short steps. We use this to build your Voice DNA, the spine of every script we
          generate.
        </p>
      </header>
      <OnboardingWizard />
    </main>
  );
}
