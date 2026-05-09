import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  redirect(profile ? "/dashboard" : "/onboarding/set-password");
}
