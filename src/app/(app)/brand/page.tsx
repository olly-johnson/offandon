import { redirect } from "next/navigation";

import { ComingSoon } from "@/components/app-shell/coming-soon";
import { isAdmin } from "@/engines/admin/auth";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

export const metadata = { title: "Brand · Bot OS" };

export default async function BrandPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");
  if (!isAdmin(user)) redirect("/dashboard");

  return (
    <ComingSoon
      title="Brand"
      blurb="Edit your Voice DNA, methodology overlay, story bank, and signature phrases without rerunning onboarding."
    />
  );
}
