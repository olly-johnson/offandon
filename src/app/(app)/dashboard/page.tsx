import Link from "next/link";
import { redirect } from "next/navigation";
import { Lightbulb, MessageCircleQuestion, ScrollText, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/app-shell/topbar";
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

  const [snapshot, dna] = await Promise.all([
    loadDashboard(user.id),
    getCurrentVoiceDNA(supabase, user.id),
  ]);
  const suggestions = buildSuggestions(snapshot);
  const greetingName = user.email?.split("@")[0] ?? "there";
  const greeting = `${timeOfDayGreeting()}, ${greetingName}`;

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
          <h2 className="text-2xl font-semibold tracking-tight">{greeting}</h2>

          <MetricRow
            scripts={snapshot.totals.scripts}
            batches={snapshot.totals.batches}
            conversations={snapshot.totals.conversations}
          />

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <ContentPlanCard
              recentScripts={snapshot.recentScripts}
              hasDna={Boolean(dna)}
            />
            <FunnelBalanceCard
              percent={snapshot.funnelPercent}
              total={snapshot.funnel.total}
            />
          </div>

          <QuickActions />

          <SuggestionsCard suggestions={suggestions} />
        </div>
      </div>
    </>
  );
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function MetricRow({
  scripts,
  batches,
  conversations,
}: {
  scripts: number;
  batches: number;
  conversations: number;
}) {
  const cards = [
    { label: "Total followers", value: "n/a", hint: "Connect Instagram" },
    { label: "Total scripts", value: scripts.toLocaleString(), hint: "" },
    { label: "Recent batches", value: batches.toLocaleString(), hint: "" },
    { label: "Conversations", value: conversations.toLocaleString(), hint: "" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <li
          key={c.label}
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</p>
          {c.hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ContentPlanCard({
  recentScripts,
  hasDna,
}: {
  recentScripts: Array<{ id: string; title: string; status: string; batch_id: string | null }>;
  hasDna: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">This week&apos;s content plan</h3>
          <p className="text-xs text-muted-foreground">Last 12 scripts across your batches.</p>
        </div>
        {hasDna ? (
          <Link href="/scripts">
            <Button size="sm">Generate plan</Button>
          </Link>
        ) : (
          <Link href="/onboarding">
            <Button size="sm" variant="outline">Finish onboarding</Button>
          </Link>
        )}
      </header>

      {recentScripts.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No scripts yet. Hit &ldquo;Generate plan&rdquo; to kick off the first batch.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {recentScripts.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link
                href={s.batch_id ? `/scripts/${s.batch_id}` : "/scripts"}
                className="flex-1 truncate text-sm hover:text-primary"
              >
                {s.title}
              </Link>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FunnelBalanceCard({
  percent,
  total,
}: {
  percent: { TOF: number; MOF: number; BOF: number };
  total: number;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h3 className="text-sm font-semibold">Trust Funnel balance</h3>
      <p className="mb-4 text-xs text-muted-foreground">Target 50 / 35 / 15.</p>
      <FunnelChart percent={percent} total={total} />
    </section>
  );
}

function QuickActions() {
  const actions = [
    {
      icon: ScrollText,
      title: "Generate scripts",
      blurb: "7 fresh scripts grounded in your Voice DNA.",
      href: "/scripts",
      cta: "Open Scripts",
      disabled: false,
    },
    {
      icon: MessageCircleQuestion,
      title: "I'm stuck",
      blurb: "Talk it out. Chat will sound like you and apply your methodology.",
      href: "/chat",
      cta: "Start chat",
      disabled: false,
    },
    {
      icon: Video,
      title: "Analyse a video",
      blurb: "Paste a competitor's reel and get a Trust-Funnel audit.",
      href: "/research",
      cta: "Coming soon",
      disabled: true,
    },
  ];

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Quick actions</h3>
      <ul className="grid gap-3 md:grid-cols-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <li
              key={a.title}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-primary" />
                <h4 className="text-sm font-medium">{a.title}</h4>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{a.blurb}</p>
              <div className="mt-4">
                {a.disabled ? (
                  <Button size="sm" variant="outline" disabled>
                    {a.cta}
                  </Button>
                ) : (
                  <Link href={a.href}>
                    <Button size="sm">{a.cta}</Button>
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SuggestionsCard({
  suggestions,
}: {
  suggestions: Array<{ kind: string; text: string }>;
}) {
  if (suggestions.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <header className="mb-3 flex items-center gap-2">
        <Lightbulb className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">AI suggestions</h3>
      </header>
      <ul className="flex flex-col gap-2 text-sm">
        {suggestions.map((s, i) => (
          <li key={i} className="rounded-md border border-border bg-background p-3">
            {s.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
