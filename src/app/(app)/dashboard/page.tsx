import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Lightbulb, Search, Sparkles, Zap } from "lucide-react";

import { Topbar } from "@/components/app-shell/topbar";
import { MetricCard } from "@/components/app-shell/metric-card";
import {
  getConnection,
  listMediaForUser,
} from "@/engines/instagram/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";

import { buildSuggestions, loadDashboard } from "./data";
import { FunnelChart } from "./funnel-chart";

const log = createLogger("page.dashboard");

export const metadata = {
  title: "Dashboard · Bot OS",
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [snapshot, dna, igConnection, igMedia, profileRow] = await Promise.all([
    loadDashboard(user.id),
    getCurrentVoiceDNA(supabase, user.id),
    getConnection(supabase, user.id),
    listMediaForUser(supabase, user.id, 50),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const suggestions = buildSuggestions(snapshot);
  // Greeting prefers the first word of display_name (so "Alex Ben Shaw" -> "Alex"),
  // falls back to the email handle, then a generic "there". Ingestion (BO-042)
  // populates display_name; the wizard sets it too.
  const firstName = firstWordOf(profileRow?.display_name) ?? user.email?.split("@")[0] ?? "there";

  // Weekly reach = sum of `reach` across media posted in the last 7 days.
  // Nulls are skipped; if nothing posted this week we render "-" so the
  // card doesn't lie with a misleading 0.
  const weeklyReach = sumWeeklyReach(igMedia);

  log.debug("dashboard rendered", {
    user_id: user.id,
    scripts: snapshot.totals.scripts,
    batches: snapshot.totals.batches,
    suggestion_count: suggestions.length,
  });

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs" style={{ color: "var(--oo-text-dim)" }}>
                {formatDate()}
              </p>
              <h2
                className="text-2xl font-bold"
                style={{ color: "var(--oo-text-primary)", letterSpacing: "-0.03em" }}
              >
                {timeOfDayGreeting()}, {firstName}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {igConnection ? (
              <>
                <MetricCard
                  label="Followers"
                  value={
                    igConnection.followers_count !== null
                      ? igConnection.followers_count.toLocaleString()
                      : "-"
                  }
                  sub={
                    igConnection.ig_username
                      ? `@${igConnection.ig_username}`
                      : "Instagram linked"
                  }
                />
                <MetricCard
                  label="Reach (7d)"
                  value={
                    weeklyReach !== null ? weeklyReach.toLocaleString() : "-"
                  }
                  sub="across posts this week"
                />
              </>
            ) : (
              <MetricCard
                label="Followers"
                value="n/a"
                trend="Connect Instagram"
                up={null}
                sub="not yet linked"
              />
            )}
            <MetricCard
              label="Total scripts"
              value={snapshot.totals.scripts.toLocaleString()}
              sub="all time"
            />
            <MetricCard
              label="Recent batches"
              value={snapshot.totals.batches.toLocaleString()}
              sub="last 5"
            />
            {igConnection ? null : (
              <MetricCard
                label="Conversations"
                value={snapshot.totals.conversations.toLocaleString()}
                sub="active threads"
              />
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="oo-card-static p-6 lg:col-span-2">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3
                    className="text-sm font-bold"
                    style={{ color: "var(--oo-text-primary)" }}
                  >
                    This week&apos;s content plan
                  </h3>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--oo-text-dim)" }}
                  >
                    {snapshot.recentScripts.length} scripts across recent batches
                  </p>
                </div>
                {dna ? (
                  <Link href="/scripts">
                    <button className="gold-btn flex items-center gap-1.5 px-4 py-2.5 text-xs">
                      <Zap className="size-3.5" /> Generate plan
                    </button>
                  </Link>
                ) : (
                  <Link href="/onboarding">
                    <button className="gold-btn-outline px-4 py-2.5 text-xs">
                      Finish onboarding
                    </button>
                  </Link>
                )}
              </div>

              {snapshot.recentScripts.length === 0 ? (
                <p
                  className="py-8 text-center text-sm"
                  style={{ color: "var(--oo-text-dim)" }}
                >
                  No scripts yet. Hit &ldquo;Generate plan&rdquo; to create your first batch.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--oo-border)" }}>
                      <th className="label-xs pb-3 pr-4 text-left">Script</th>
                      <th className="label-xs pb-3 pr-4 text-left">Status</th>
                      <th className="label-xs pb-3 text-left">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.recentScripts.map((s) => (
                      <tr
                        key={s.id}
                        style={{ borderBottom: "1px solid var(--oo-border-subtle)" }}
                      >
                        <td
                          className="max-w-[320px] truncate py-2.5 pr-4 font-medium"
                          style={{ color: "var(--oo-text-primary)" }}
                        >
                          {s.title}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="gold-tag">{s.status}</span>
                        </td>
                        <td className="py-2.5">
                          {s.batch_id ? (
                            <Link
                              href={`/scripts/batches/${s.batch_id}`}
                              className="text-xs"
                              style={{ color: "var(--oo-gold)" }}
                            >
                              View batch
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="oo-card-static flex flex-col p-6">
              <div className="mb-4">
                <h3
                  className="text-sm font-bold"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  Trust Funnel balance
                </h3>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--oo-text-dim)" }}
                >
                  Target: 50% Connect / 35% Nurture / 15% Convert
                </p>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <FunnelChart
                  percent={snapshot.funnelPercent}
                  total={snapshot.funnel.total}
                />
              </div>
            </div>
          </div>

          <QuickActions />

          {suggestions.length > 0 ? (
            <div className="oo-card-static p-6">
              <div className="mb-5 flex items-center gap-2.5">
                <div
                  className="flex size-8 items-center justify-center rounded-xl"
                  style={{
                    background: "var(--oo-gold-dim)",
                    border: "1px solid var(--oo-border-gold)",
                  }}
                >
                  <Sparkles className="size-4" style={{ color: "var(--oo-gold)" }} />
                </div>
                <div>
                  <h3
                    className="text-sm font-bold"
                    style={{ color: "var(--oo-text-primary)" }}
                  >
                    AI suggestions
                  </h3>
                  <p className="text-xs" style={{ color: "var(--oo-text-dim)" }}>
                    Based on your recent batches
                  </p>
                </div>
              </div>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-3.5"
                  style={{
                    borderBottom:
                      i < suggestions.length - 1
                        ? "1px solid var(--oo-border-subtle)"
                        : "none",
                  }}
                >
                  <div
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "var(--oo-bg-hover)" }}
                  >
                    <Sparkles className="size-3.5" style={{ color: "var(--oo-gold)" }} />
                  </div>
                  <p
                    className="flex-1 text-sm leading-relaxed"
                    style={{ color: "var(--oo-text-secondary)" }}
                  >
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function sumWeeklyReach(
  media: Array<{ reach: number | null; posted_at: string | null }>,
): number | null {
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let any = false;
  let sum = 0;
  for (const m of media) {
    if (!m.posted_at) continue;
    if (new Date(m.posted_at).getTime() < weekAgoMs) continue;
    if (m.reach === null) continue;
    sum += m.reach;
    any = true;
  }
  return any ? sum : null;
}

function firstWordOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const first = trimmed.split(/\s+/)[0];
  return first.length > 0 ? first : null;
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function QuickActions() {
  const actions = [
    {
      icon: FileText,
      title: "Generate scripts",
      desc: "Create this week's scripts from your Voice DNA.",
      href: "/scripts",
      cta: "Generate now",
      primary: true,
    },
    {
      icon: Lightbulb,
      title: "I'm stuck",
      desc: "Talk it out. Chat applies your methodology and voice.",
      href: "/chat",
      cta: "Start",
      primary: false,
    },
    {
      icon: Search,
      title: "Analyse a video",
      desc: "Paste a competitor's reel for a Trust Funnel breakdown.",
      href: "/research",
      cta: "Coming soon",
      primary: false,
      disabled: true,
    },
  ];

  return (
    <div>
      <p
        className="mb-3 text-xs font-semibold"
        style={{ color: "var(--oo-text-secondary)" }}
      >
        Quick actions
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {actions.map(({ icon: Icon, title, desc, href, cta, primary, disabled }) => {
          const Inner = (
            <div className="oo-card cursor-pointer p-5">
              <div
                className="mb-4 flex size-9 items-center justify-center rounded-xl"
                style={{
                  background: "var(--oo-gold-dim)",
                  border: "1px solid var(--oo-border-gold)",
                }}
              >
                <Icon className="size-4" style={{ color: "var(--oo-gold)" }} />
              </div>
              <p
                className="mb-1 text-sm font-semibold"
                style={{ color: "var(--oo-text-primary)" }}
              >
                {title}
              </p>
              <p
                className="mb-4 text-xs leading-relaxed"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                {desc}
              </p>
              <button
                disabled={disabled}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${primary ? "gold-btn" : "gold-btn-outline"}`}
              >
                {cta}
              </button>
            </div>
          );
          return disabled ? (
            <div key={title}>{Inner}</div>
          ) : (
            <Link key={title} href={href}>
              {Inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
