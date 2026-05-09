import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("page.admin.invite");

export const metadata = {
  title: "Invite — Bot OS Admin",
};

/**
 * Admin invite page — STUB.
 *
 * MVP path: send invites from the Supabase dashboard
 *   Authentication → Users → Invite User
 *
 * TODO (post-MVP):
 *   1. Add an `is_admin` claim or role check (custom claims on auth.users
 *      app_metadata, set via service-role API).
 *   2. Build a server action that calls
 *      `supabase.auth.admin.inviteUserByEmail(email)` using the
 *      service-role client (NOT the anon client — admin endpoints require
 *      service role and must NEVER be reachable from the browser).
 *   3. Audit-log every invite to a new `admin_invites` table.
 *   4. Rate-limit by admin user_id to prevent accidental floods.
 */
export default async function AdminInvitePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  log.info("admin invite stub viewed", { user_id: user.id });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Invite a creator</h1>
      <p className="mt-2 text-sm text-muted-foreground">This page is a stub.</p>

      <section className="mt-8 rounded-lg border border-border bg-card p-6">
        <h2 className="text-sm font-medium">For now: invite via the Supabase dashboard</h2>
        <ol className="mt-3 list-decimal pl-5 text-sm text-muted-foreground space-y-1">
          <li>Open the project in Supabase.</li>
          <li>Authentication → Users → Invite User.</li>
          <li>Paste their email and send.</li>
        </ol>
        <a
          href="https://supabase.com/dashboard/project/zihfgidtoqwcnnjnlvof/auth/users"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Open Supabase users
        </a>
      </section>

      <section className="mt-6 rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
        Programmatic invites (auth.admin.inviteUserByEmail) ship in a follow-up PR. They need the
        service-role key + an admin role check + an audit log.
      </section>
    </main>
  );
}
