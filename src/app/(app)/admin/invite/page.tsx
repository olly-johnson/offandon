import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { isAdmin } from "@/engines/admin/auth";
import { listRecentInvites } from "@/engines/admin/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { InviteForm } from "./invite-form";

const log = createLogger("page.admin.invite");

export const metadata = {
  title: "Invite · Bot OS Admin",
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  sent:     { label: "Sent",     color: "var(--oo-tof)" },
  accepted: { label: "Accepted", color: "var(--oo-gold)" },
  revoked:  { label: "Revoked",  color: "var(--oo-text-dim)" },
  failed:   { label: "Failed",   color: "var(--oo-bof)" },
};

function formatDate(iso: string): string {
  // ISO date only (no locale-formatted time) to dodge SSR/client
  // hydration mismatches; see PR #23.
  return iso.slice(0, 10);
}

export default async function AdminInvitePage() {
  // The (app) layout already enforces signed-in + onboarded; we only
  // need the user object here for the admin check + logging.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    log.warn("non-admin viewed admin invite", { user_id: user?.id });
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-semibold tracking-tight">Admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This page is gated. Speak to whoever runs Bot OS if you think you should have access.
        </p>
      </main>
    );
  }

  const adminClient = createSupabaseAdminClient();
  const invites = await listRecentInvites(adminClient, { limit: 20 });

  log.info("admin invite page viewed", {
    user_id: user?.id,
    recent_count: invites.length,
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--oo-text-dim)" }}
      >
        <ArrowLeft className="size-3.5" />
        Back to admin
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Invite a creator</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sends a Supabase invite email. They click through, set a password, and land in onboarding.
      </p>

      <section className="mt-8 rounded-lg border border-border bg-card p-6">
        <InviteForm />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Recent invites</h2>
        {invites.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No invites issued yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
            {invites.map((row) => {
              const style = STATUS_STYLES[row.status] ?? STATUS_STYLES.sent;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.email}</p>
                    {row.error ? (
                      <p
                        className="mt-0.5 truncate text-xs"
                        style={{ color: "var(--oo-bof)" }}
                        title={row.error}
                      >
                        {row.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs">
                    <span style={{ color: style.color }}>{style.label}</span>
                    <time
                      dateTime={row.created_at}
                      className="text-muted-foreground"
                    >
                      {formatDate(row.created_at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
