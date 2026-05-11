import Image from "next/image";
import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { SigninForm } from "./signin-form";

const log = createLogger("page.signin");

export const metadata = {
  title: "Sign in · Bot OS",
};

export default async function SigninPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    log.debug("already signed in, redirecting to /dashboard", { user_id: user.id });
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <header className="flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="ABS Creative Studios"
            width={96}
            height={96}
            priority
            className="size-20 rounded-xl"
            style={{ boxShadow: "var(--oo-shadow-md)" }}
          />
          <p className="mt-4 text-sm text-muted-foreground">Sign in to continue.</p>
        </header>
        <div className="rounded-lg border border-border bg-card p-6">
          <SigninForm />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Bot OS is invite-only. If you don&apos;t have an invite, ask Olly.
        </p>
      </div>
    </main>
  );
}
