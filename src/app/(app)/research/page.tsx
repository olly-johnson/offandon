import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import type { MediaAnalysis } from "@/engines/research";
import {
  COMPETITOR_LIMIT_PER_USER,
  DEFAULT_OUTLIER_FEED_OPTIONS,
  getAnalysesForCompetitorMediaIds,
  getOutlierFeed,
  listCompetitors,
  listMediaForCompetitor,
  listResearchVault,
  type CompetitorMediaRow,
} from "@/engines/competitor";
import type { OutlierFeedPlatform } from "@/engines/competitor/outlier-feed";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { CompetitorList } from "./competitor-list";
import { OutlierFeed } from "./outlier-feed";
import { loadResearchTrends } from "./trends-data";
import { TrendsSection } from "./trends-section";
import { VaultPanel } from "./vault-panel";

const PREVIEW_REELS_PER_COMPETITOR = 5;

const ALLOWED_OUTLIER_RATIOS = new Set([2, 3, 5, 10]);
const ALLOWED_WINDOW_DAYS = new Set([30, 90, 180, 365]);
const ALLOWED_MIN_VIEWS = new Set([0, 100_000, 500_000, 1_000_000, 10_000_000]);
// "youtube_shorts" intentionally excluded while YT is disabled; a stale
// ?platform=youtube_shorts URL falls back to "all".
const ALLOWED_PLATFORMS = new Set<OutlierFeedPlatform>([
  "all",
  "instagram",
  "tiktok",
]);

function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

function parseFilters(params: Record<string, string | string[] | undefined>) {
  const outlierRaw = Number(firstParam(params, "outlier"));
  const windowRaw = Number(firstParam(params, "window"));
  const viewsRaw = Number(firstParam(params, "views"));
  const platformRaw = firstParam(params, "platform") as
    | OutlierFeedPlatform
    | undefined;
  return {
    minOutlierRatio: ALLOWED_OUTLIER_RATIOS.has(outlierRaw)
      ? outlierRaw
      : DEFAULT_OUTLIER_FEED_OPTIONS.minOutlierRatio,
    windowDays: ALLOWED_WINDOW_DAYS.has(windowRaw)
      ? windowRaw
      : DEFAULT_OUTLIER_FEED_OPTIONS.windowDays,
    minViews: ALLOWED_MIN_VIEWS.has(viewsRaw)
      ? viewsRaw
      : DEFAULT_OUTLIER_FEED_OPTIONS.minViews,
    platform:
      platformRaw && ALLOWED_PLATFORMS.has(platformRaw)
        ? platformRaw
        : DEFAULT_OUTLIER_FEED_OPTIONS.platform,
  };
}

const log = createLogger("page.research");

export const metadata = { title: "Research · Bot OS" };

interface ResearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const params = await searchParams;
  const filters = parseFilters(params);

  const competitors = await listCompetitors(supabase, user.id);
  const outliers = await getOutlierFeed(supabase, user.id, filters);
  // Vault rows live on client_assets; RLS lets the user read their own
  // rows so we could use the user-scoped client. The admin client just
  // skips the policy roundtrip and the data is server-rendered anyway.
  const vaultItems = await listResearchVault(
    createSupabaseAdminClient(),
    user.id,
    20,
  );
  const trends = await loadResearchTrends(user.id);

  // Per-competitor preview strip: 5 most recent reels each + any
  // existing analyses, fetched in parallel so the page render is
  // bounded by the slowest query, not the sum. For 5 competitors
  // that's ~10 round-trips total - fine, no need for a custom RPC yet.
  const reelsByCompetitor: Record<string, CompetitorMediaRow[]> = {};
  const analysesByMediaId: Record<string, MediaAnalysis> = {};
  if (competitors.length > 0) {
    const reelLists = await Promise.all(
      competitors.map((c) =>
        listMediaForCompetitor(supabase, c.id, PREVIEW_REELS_PER_COMPETITOR),
      ),
    );
    competitors.forEach((c, i) => {
      reelsByCompetitor[c.id] = reelLists[i];
    });
    const allMediaIds = reelLists.flat().map((r) => r.id);
    if (allMediaIds.length > 0) {
      const analyses = await getAnalysesForCompetitorMediaIds(
        supabase,
        allMediaIds,
      );
      for (const [id, a] of analyses) analysesByMediaId[id] = a;
    }
  }

  log.debug("research page rendered", {
    user_id: user.id,
    competitor_count: competitors.length,
    preview_reels: Object.values(reelsByCompetitor).reduce(
      (n, list) => n + list.length,
      0,
    ),
  });

  return (
    <>
      <Topbar title="Research" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col">
          <header className="mb-6 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--oo-gold)" }}
              >
                Step 1
              </span>
              <h2
                className="text-2xl font-bold"
                style={{
                  color: "var(--oo-text-primary)",
                  letterSpacing: "-0.03em",
                }}
              >
                Customise Your Feed
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                Discover successful channels from Instagram and TikTok. Pin up
                to {COMPETITOR_LIMIT_PER_USER} and we will transcribe their videos,
                surface the hooks and formats that are working, and feed them
                back into your methodology.
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{
                background: "var(--oo-bg-elevated)",
                color: "var(--oo-text-secondary)",
                border: "1px solid var(--oo-border-subtle)",
              }}
            >
              {competitors.length} / {COMPETITOR_LIMIT_PER_USER}
            </span>
          </header>

          <CompetitorList
            userId={user.id}
            competitors={competitors}
            limit={COMPETITOR_LIMIT_PER_USER}
            reelsByCompetitor={reelsByCompetitor}
            analysesByMediaId={analysesByMediaId}
          />

          <div className="mt-10">
            <OutlierFeed
              items={outliers}
              hasCompetitors={competitors.length > 0}
              filters={filters}
            />
          </div>

          <div className="mt-10">
            <VaultPanel items={vaultItems} />
          </div>

          <div className="mt-10">
            <TrendsSection trends={trends} />
          </div>
        </div>
      </div>
    </>
  );
}
