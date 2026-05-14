import Link from "next/link";

import { Topbar } from "@/components/app-shell/topbar";
import { MetricCard } from "@/components/app-shell/metric-card";
import { isAdmin } from "@/engines/admin/auth";
import {
  computeAdminStats,
  computeClientHealth,
  type ClientHealth,
} from "@/engines/admin/stats";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("page.admin.overview");

export const metadata = {
  title: "Admin · Bot OS",
};

const HEALTH_LABEL: Record<ClientHealth, string> = {
  green: "Active",
  amber: "Quiet",
  red: "Idle",
};

const HEALTH_COLOR: Record<ClientHealth, string> = {
  green: "var(--oo-tof)",
  amber: "var(--oo-gold)",
  red: "var(--oo-bof)",
};

function HealthDot({ health }: { health: ClientHealth }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2 rounded-full"
      style={{ background: HEALTH_COLOR[health] }}
    />
  );
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "today";
  const day = 86_400_000;
  const days = Math.floor(ms / day);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default async function AdminOverviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    log.warn("non-admin viewed admin overview", { user_id: user?.id });
    return (
      <>
        <Topbar title="Admin" />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Admin only</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--oo-text-dim)" }}>
            This page is gated. Speak to whoever runs Bot OS if you think you should have access.
          </p>
        </main>
      </>
    );
  }

  const adminClient = createSupabaseAdminClient();
  const [stats, clients] = await Promise.all([
    computeAdminStats(adminClient),
    computeClientHealth(adminClient),
  ]);

  log.info("admin overview viewed", {
    user_id: user?.id,
    clients: stats.total_clients,
  });

  return (
    <>
      <Topbar title="Admin" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                className="text-2xl font-bold"
                style={{ color: "var(--oo-text-primary)", letterSpacing: "-0.03em" }}
              >
                Client health
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--oo-text-dim)" }}>
                Activity across every onboarded creator.
              </p>
            </div>
            <Link
              href="/admin/invite"
              className="gold-btn-outline rounded-lg px-4 py-2.5 text-xs"
            >
              Invite a creator
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard
              label="Total clients"
              value={stats.total_clients.toLocaleString()}
              sub="onboarded"
            />
            <MetricCard
              label="Total scripts"
              value={stats.total_scripts.toLocaleString()}
              sub="all time"
            />
            <MetricCard
              label="Total chats"
              value={stats.total_chats.toLocaleString()}
              sub="conversations"
            />
            <MetricCard
              label="Total messages"
              value={stats.total_messages.toLocaleString()}
              sub="user + assistant"
            />
          </div>

          <div className="oo-card-static overflow-hidden">
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid var(--oo-border)" }}
            >
              <div>
                <h3
                  className="text-sm font-bold"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  Client overview
                </h3>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--oo-text-dim)" }}
                >
                  Health derives from last sign-in: green &lt;=7d, amber &lt;=30d, red older.
                </p>
              </div>
            </div>

            {clients.length === 0 ? (
              <p
                className="py-8 text-center text-sm"
                style={{ color: "var(--oo-text-dim)" }}
              >
                No clients yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ borderBottom: "1px solid var(--oo-border)" }}>
                    <tr>
                      {[
                        "Client",
                        "Health",
                        "Scripts",
                        "Chats",
                        "Messages",
                        "Last sign-in",
                      ].map((h) => (
                        <th
                          key={h}
                          className="label-xs px-5 py-3.5 text-left"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => (
                      <tr
                        key={c.id}
                        style={{ borderBottom: "1px solid var(--oo-border-subtle)" }}
                      >
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: "var(--oo-text-primary)" }}
                              >
                                {c.name}
                              </span>
                              {c.is_admin ? (
                                <span
                                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                                  style={{
                                    background: "var(--oo-gold-dim)",
                                    color: "var(--oo-gold)",
                                    border: "1px solid var(--oo-border-gold)",
                                  }}
                                >
                                  Admin
                                </span>
                              ) : null}
                            </div>
                            {c.email && c.email !== c.name ? (
                              <span
                                className="text-xs"
                                style={{ color: "var(--oo-text-dim)" }}
                              >
                                {c.email}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <HealthDot health={c.health} />
                            <span
                              className="text-xs font-medium capitalize"
                              style={{ color: "var(--oo-text-secondary)" }}
                            >
                              {HEALTH_LABEL[c.health]}
                            </span>
                          </div>
                        </td>
                        <td
                          className="px-5 py-4 font-mono font-semibold"
                          style={{ color: "var(--oo-text-primary)" }}
                        >
                          {c.scripts}
                        </td>
                        <td
                          className="px-5 py-4 font-mono"
                          style={{ color: "var(--oo-text-secondary)" }}
                        >
                          {c.chats}
                        </td>
                        <td
                          className="px-5 py-4 font-mono"
                          style={{ color: "var(--oo-text-secondary)" }}
                        >
                          {c.messages}
                        </td>
                        <td
                          className="px-5 py-4 text-xs"
                          style={{ color: "var(--oo-text-secondary)" }}
                        >
                          {formatLastSeen(c.last_sign_in_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
            Token spend and engagement are not tracked yet. Wire an `api_usage` table to the
            Anthropic SDK response logs to surface them here.
          </p>
        </div>
      </div>
    </>
  );
}
