import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ChangePasswordForm } from "./change-password-form";

export const metadata = {
  title: "Settings . Bot OS",
};

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--oo-text-primary)", letterSpacing: "-0.02em" }}
        >
          Settings
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          Manage your account.
        </p>
      </header>

      <section className="oo-card-static p-6">
        <h2
          className="mb-1 text-base font-semibold"
          style={{ color: "var(--oo-text-primary)" }}
        >
          Change password
        </h2>
        <p
          className="mb-4 text-xs"
          style={{ color: "var(--oo-text-dim)" }}
        >
          Signed in as {user.email}.
        </p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
