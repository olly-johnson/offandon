import { redirect } from "next/navigation";

import { hasVoiceDna } from "@/lib/shared/onboarding";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  // Operator-ingested users (BO-042) already have a profile + voice_dna
  // before they sign in. Either presence means onboarding is done.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) redirect("/dashboard");
  if (await hasVoiceDna(supabase, user.id)) redirect("/dashboard");
  redirect("/onboarding/set-password");
}
