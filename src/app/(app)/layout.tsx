import { redirect } from "next/navigation";

import { isAdmin } from "@/engines/admin/auth";
import { AppShell } from "@/components/app-shell/app-shell";
import { hasVoiceDna } from "@/lib/shared/onboarding";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

/**
 * Layout for every authenticated, in-app surface. Resolves the current
 * user once for the shell so child pages do not have to.
 *
 * Auth contract: signed-in users with a profile pass through. Anyone
 * without a session is sent to /signin. Anyone with a session but no
 * profile is sent to /onboarding UNLESS they have a Voice DNA row already
 * (operator-ingested users per BO-042. They get a synthesized profile
 * inline and skip the wizard).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    if (!(await hasVoiceDna(supabase, user.id))) redirect("/onboarding");
    // Ingested user with no profile row yet. The committer always writes
    // profile + voice_dna in the same run, so this is an edge case (race
    // or partial-commit). Send them to /onboarding/set-password so they
    // can land a session, after which the next nav will resolve normally.
    redirect("/onboarding/set-password");
  }

  return (
    <AppShell
      email={user.email ?? "you"}
      displayName={profile.display_name}
      isAdmin={isAdmin(user)}
    >
      {children}
    </AppShell>
  );
}
