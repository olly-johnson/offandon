import { notFound, redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import {
  getAnalysisForCompetitorMedia,
  getCompetitorForUser,
  getCompetitorMediaForUser,
  listMediaForCompetitor,
} from "@/engines/competitor";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";

import { ReelDrillIn } from "./reel-drill-in";

const log = createLogger("page.research.reel");

export const metadata = { title: "Reel analysis · Bot OS" };

/**
 * Step 3: per-reel drill-in. "Understand why they went viral."
 * Tabbed view over the structural analysis plus a computed metrics
 * block (outlier ratio vs the channel's median, engagement rate).
 *
 * The page fetches all sibling reels to compute the channel's
 * median view count once on the server. For 30 reels this is one
 * extra round-trip that returns ~5KB; we don't pre-aggregate
 * because the user only lands here from one tile at a time.
 */
export default async function ReelDrillInPage({
  params,
}: {
  params: Promise<{ competitorId: string; mediaId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { competitorId, mediaId } = await params;
  const [competitor, media, siblingReels] = await Promise.all([
    getCompetitorForUser(supabase, { userId: user.id, id: competitorId }),
    getCompetitorMediaForUser(supabase, { userId: user.id, mediaId }),
    listMediaForCompetitor(supabase, competitorId, 200),
  ]);

  if (!competitor) notFound();
  if (!media || media.competitor_id !== competitor.id) notFound();

  const analysis = await getAnalysisForCompetitorMedia(supabase, mediaId);

  // Is this reel already in the user's research vault? Cheap point
  // read on client_assets; lets the drill-in button render the right
  // state ("Save to vault" vs "Saved") on first paint.
  const admin = createSupabaseAdminClient();
  const { data: vaultProbe } = await admin
    .from("client_assets")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_file", `competitor:${mediaId}`)
    .maybeSingle();
  const inVault = vaultProbe !== null;

  const viewCounts = siblingReels
    .map((r) => r.view_count)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const channelMedianViews = computeMedian(viewCounts);
  const outlierRatio =
    media.view_count != null && channelMedianViews && channelMedianViews > 0
      ? media.view_count / channelMedianViews
      : null;

  const engagementRate =
    media.view_count && media.view_count > 0
      ? ((media.like_count ?? 0) + (media.comments_count ?? 0)) /
        media.view_count
      : null;

  log.debug("reel drill-in rendered", {
    user_id: user.id,
    competitor_id: competitor.id,
    media_id: media.id,
    has_analysis: analysis !== null,
  });

  return (
    <>
      <Topbar title={`@${competitor.username}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col">
          <ReelDrillIn
            userId={user.id}
            competitor={competitor}
            media={media}
            analysis={analysis}
            channelMedianViews={channelMedianViews}
            outlierRatio={outlierRatio}
            engagementRate={engagementRate}
            siblingCount={siblingReels.length}
            inVault={inVault}
          />
        </div>
      </div>
    </>
  );
}

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
