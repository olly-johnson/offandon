import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { OnboardingWizard } from "./wizard";

const log = createLogger("page.onboarding");

export const metadata = {
  title: "Onboarding . Bot OS",
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
    <main className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-10 flex items-start gap-4">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
            boxShadow: "var(--oo-shadow-md)",
          }}
        >
          O
        </div>
        <div>
          <h1
            className="text-3xl font-bold"
            style={{
              color: "var(--oo-text-primary)",
              letterSpacing: "-0.03em",
            }}
          >
            Bot OS onboarding
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            Four short steps. We use this to build your Voice DNA, the spine of
            every script and chat reply we generate.
          </p>
        </div>
      </header>
      <OnboardingWizard />
    </main>
  );
}
