import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import {
  getConnection,
  listFollowerHistory,
  listMediaForUser,
  type MediaRow,
} from "@/engines/instagram/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import {
  buildEngagementSeries,
  buildTopContent,
  computeAccountMetrics,
  type DashboardMediaRow,
} from "@/lib/shared/dashboard-metrics";

import { buildSuggestions, loadDashboard } from "./data";
import { loadFormulaMatrix } from "./formula-matrix-data";
import { DashboardHeader } from "./components/header";
import { MetricsStrip } from "./components/metrics-strip";
import { EngagementChart } from "./components/engagement-chart";
import { PerformanceTabs } from "./components/performance-tabs";
import { TopContentTable } from "./components/top-content-table";
import { FunnelBalanceCard } from "./components/funnel-balance-card";
import { FormulaMatrixCard } from "./components/formula-matrix-card";
import {
  CompetitorsCard,
  IdentityDepthCard,
  StoryBankCard,
} from "./components/side-cards";
import { RecommendationsCard } from "./components/recommendations-card";

const log = createLogger("page.dashboard");

export const metadata = {
  title: "Dashboard · Bot OS",
};

const PILLAR_PALETTE = [
  "#C8A04A",
  "#A38840",
  "#E8D5A3",
  "#886B2A",
  "#D4B868",
  "#6B5520",
  "#F5ECD7",
  "#B8993A",
];

const FORMAT_LABELS: Record<string, string> = {
  IMAGE: "Image",
  VIDEO: "Video",
  CAROUSEL_ALBUM: "Carousel",
  REELS: "Reel",
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const now = new Date();
  const [snapshot, igConnection, igMedia, followerHistory, formulaMatrix, profileRow] =
    await Promise.all([
    loadDashboard(user.id),
    getConnection(supabase, user.id),
    listMediaForUser(supabase, user.id, 100),
    listFollowerHistory(supabase, user.id, { sinceDays: 30, now }),
    loadFormulaMatrix(user.id),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  const dashboardRows: DashboardMediaRow[] = igMedia.map(stripMedia);
  const metrics = computeAccountMetrics(dashboardRows, {
    followers: igConnection?.followers_count ?? null,
    now,
    followerHistory,
  });
  const engagementSeries = buildEngagementSeries(dashboardRows, now, 30);
  const topContent = buildTopContent(dashboardRows, { now, limit: 10 });
  const suggestions = buildSuggestions(snapshot);

  // Performance breakdown sources:
  //  - Format from IG media types (real signal)
  //  - Funnel from script angles (already on snapshot)
  //  - Pillar from script pillars (already on snapshot)
  const formatRows = computeFormatBreakdown(dashboardRows, now);
  const funnelRows: Array<{ label: "Connect" | "Nurture" | "Convert"; value: number }> = [
    { label: "Connect", value: snapshot.funnel.TOF },
    { label: "Nurture", value: snapshot.funnel.MOF },
    { label: "Convert", value: snapshot.funnel.BOF },
  ];
  const pillarRows = snapshot.pillarDistribution.map((p, i) => ({
    label: p.pillar,
    value: p.count,
    color: PILLAR_PALETTE[i % PILLAR_PALETTE.length],
  }));

  const displayName = profileRow?.display_name?.trim() || user.email?.split("@")[0] || "Creator";
  const handle = igConnection?.ig_username ?? null;
  const windowLabel = `Last 30 days, as of ${formatDate(now)}`;

  log.debug("dashboard rendered", {
    user_id: user.id,
    media: igMedia.length,
    engagement_points: engagementSeries.length,
    top_content: topContent.length,
    suggestion_count: suggestions.length,
  });

  return (
    <>
      <Topbar title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-[1400px]">
          <DashboardHeader
            displayName={displayName}
            handle={handle}
            windowLabel={windowLabel}
            avatarUrl={igConnection?.ig_profile_picture_url ?? null}
          />

          <MetricsStrip metrics={metrics} />

          <div className="oo-card-static bd-section p-6">
            <div className="bd-card-title">Engagement Over Time</div>
            <EngagementChart points={engagementSeries} />
          </div>

          <div className="oo-card-static bd-section p-6">
            <div className="bd-card-title">Performance Breakdown</div>
            <PerformanceTabs format={formatRows} funnel={funnelRows} pillar={pillarRows} />
          </div>

          <FormulaMatrixCard matrix={formulaMatrix} />

          <div className="oo-card-static bd-section p-6">
            <div className="bd-card-title">Top Performing Content</div>
            <TopContentTable rows={topContent} />
          </div>

          <div className="bd-section grid gap-5 md:grid-cols-2">
            <FunnelBalanceCard
              percent={snapshot.funnelPercent}
              total={snapshot.funnel.total}
            />
            <StoryBankCard />
          </div>

          <div className="bd-section grid gap-5 md:grid-cols-2">
            <IdentityDepthCard />
            <CompetitorsCard />
          </div>

          <RecommendationsCard suggestions={suggestions} />
        </div>
      </div>
    </>
  );
}

function stripMedia(m: MediaRow): DashboardMediaRow {
  return {
    id: m.id,
    media_type: m.media_type,
    caption: m.caption,
    permalink: m.permalink,
    posted_at: m.posted_at,
    like_count: m.like_count,
    comments_count: m.comments_count,
    reach: m.reach,
    plays: m.plays,
    saved: m.saved,
    shares: m.shares,
  };
}

function computeFormatBreakdown(
  rows: DashboardMediaRow[],
  now: Date,
): Array<{ label: string; value: number }> {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const tally = new Map<string, number>();
  for (const r of rows) {
    if (!r.posted_at) continue;
    if (new Date(r.posted_at).getTime() < cutoff) continue;
    const label = FORMAT_LABELS[r.media_type] ?? r.media_type;
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
