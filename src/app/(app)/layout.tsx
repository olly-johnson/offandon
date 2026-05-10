import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

/**
 * Layout for every authenticated, in-app surface. Resolves the current
 * user once for the shell so child pages do not have to.
 *
 * Auth contract: signed-in users with a profile pass through. Anyone
 * without a session is sent to /signin. Anyone with a session but no
 * profile (mid-onboarding) is sent to /onboarding.
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
  if (!profile) redirect("/onboarding");

  return (
    <AppShell email={user.email ?? "you"} displayName={profile.display_name}>
      {children}
    </AppShell>
  );
}
