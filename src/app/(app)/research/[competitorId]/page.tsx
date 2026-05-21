import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { Topbar } from "@/components/app-shell/topbar";
import {
  getAnalysesForCompetitorMediaIds,
  getCompetitorForUser,
  listMediaForCompetitor,
} from "@/engines/competitor";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ReelsGrid } from "./reels-grid";

const log = createLogger("page.research.competitor");

export const metadata = { title: "Competitor research · Bot OS" };

export default async function CompetitorResearchPage({
  params,
}: {
  params: Promise<{ competitorId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { competitorId } = await params;
  const competitor = await getCompetitorForUser(supabase, {
    userId: user.id,
    id: competitorId,
  });
  if (!competitor) notFound();

  const reels = await listMediaForCompetitor(supabase, competitor.id, 30);
  const analyses = await getAnalysesForCompetitorMediaIds(
    supabase,
    reels.map((r) => r.id),
  );

  const analyzedCount = analyses.size;
  log.debug("competitor research page rendered", {
    user_id: user.id,
    competitor_id: competitor.id,
    reel_count: reels.length,
    analyzed_count: analyzedCount,
  });

  return (
    <>
      <Topbar title={`@${competitor.username}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col">
          <header className="mb-6">
            <Link
              href="/research"
              className="mb-2 inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: "var(--oo-text-dim)" }}
            >
              <ArrowLeft className="size-3" />
              Back to tracked competitors
            </Link>
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2
                  className="flex items-center gap-2 text-2xl font-bold"
                  style={{
                    color: "var(--oo-text-primary)",
                    letterSpacing: "-0.03em",
                  }}
                >
                  @{competitor.username}
                  <a
                    href={`https://instagram.com/${competitor.username}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="opacity-60 hover:opacity-100"
                    aria-label="Open on Instagram"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </h2>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-secondary)" }}
                >
                  {reels.length} recent reels. Each one is being transcribed
                  and structurally analysed against your pillars; the tiles
                  fill in as the workers finish.
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
                {analyzedCount} / {reels.length} analyzed
              </span>
            </div>
          </header>

          <ReelsGrid
            userId={user.id}
            reels={reels}
            analyses={Object.fromEntries(analyses)}
          />
        </div>
      </div>
    </>
  );
}
