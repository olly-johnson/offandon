import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import type { MediaAnalysis } from "@/engines/research";
import {
  COMPETITOR_LIMIT_PER_USER,
  getAnalysesForCompetitorMediaIds,
  listCompetitors,
  listMediaForCompetitor,
  type CompetitorMediaRow,
} from "@/engines/competitor";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { CompetitorList } from "./competitor-list";

const PREVIEW_REELS_PER_COMPETITOR = 5;

const log = createLogger("page.research");

export const metadata = { title: "Research · Bot OS" };

export default async function ResearchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const competitors = await listCompetitors(supabase, user.id);

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
                Discover successful channels from Instagram. Pin up to{" "}
                {COMPETITOR_LIMIT_PER_USER} and we will transcribe their videos,
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
        </div>
      </div>
    </>
  );
}
