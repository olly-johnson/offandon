import "server-only";

import { listBatchesForUser, type BatchRow } from "@/engines/content/persistence";
import { listConversationsForUser } from "@/engines/chat/persistence";
import {
  computeFunnelBalance,
  funnelPercentages,
  FUNNEL_TARGET,
  type FunnelBalance,
} from "@/lib/shared/funnel";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import type { ScriptAngle } from "@/engines/content/types";

export interface DashboardScript {
  id: string;
  title: string;
  pillar: string | null;
  angle: ScriptAngle | null;
  status: "draft" | "published" | "archived";
  created_at: string;
  batch_id: string | null;
}

export interface DashboardSnapshot {
  totals: {
    scripts: number;
    batches: number;
    conversations: number;
  };
  recentBatches: BatchRow[];
  recentScripts: DashboardScript[];
  funnel: FunnelBalance;
  funnelPercent: { TOF: number; MOF: number; BOF: number };
  funnelGap: Array<{ stage: "TOF" | "MOF" | "BOF"; deltaPct: number }>;
  pillarDistribution: Array<{ pillar: string; count: number }>;
  topPillarShare: number;
}

const RECENT_SCRIPT_WINDOW = 12;

/**
 * Single read pass for the dashboard. Each query is small; we run them
 * in parallel and synthesize derived metrics here so the page component
 * only has to render.
 */
export async function loadDashboard(userId: string): Promise<DashboardSnapshot> {
  const supabase = await createSupabaseServerClient();

  const [batchesResult, conversationsResult, recentScriptsResult, totalScriptsResult] =
    await Promise.all([
      listBatchesForUser(supabase, userId, 5),
      listConversationsForUser(supabase, userId, 1).then((rows) => rows.length),
      supabase
        .from("scripts")
        .select("id, title, hook, status, created_at, batch_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(RECENT_SCRIPT_WINDOW),
      supabase
        .from("scripts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

  // We need angle/pillar but the scripts table does not store them today
  // (they live on the GeneratedScript before persistence). Until that is
  // refactored, derive a lightweight pillar from the title keyword and a
  // null angle. Funnel data therefore uses an empty list for users whose
  // scripts predate this feature; fresh batches will populate later.
  const recentScripts: DashboardScript[] = (recentScriptsResult.data ?? []).map((s) => ({
    id: s.id,
    title: s.title ?? s.hook ?? "Untitled",
    pillar: null,
    angle: null,
    status: s.status,
    created_at: s.created_at,
    batch_id: s.batch_id,
  }));

  const angles: ScriptAngle[] = recentScripts
    .map((s) => s.angle)
    .filter((a): a is ScriptAngle => a !== null);
  const funnel = computeFunnelBalance(angles);
  const pct = funnelPercentages(funnel);
  const funnelGap: DashboardSnapshot["funnelGap"] = (["TOF", "MOF", "BOF"] as const).map(
    (stage) => ({
      stage,
      deltaPct: pct[stage] - FUNNEL_TARGET[stage],
    }),
  );

  const pillarTally = new Map<string, number>();
  for (const s of recentScripts) {
    if (!s.pillar) continue;
    pillarTally.set(s.pillar, (pillarTally.get(s.pillar) ?? 0) + 1);
  }
  const pillarDistribution = [...pillarTally.entries()]
    .map(([pillar, count]) => ({ pillar, count }))
    .sort((a, b) => b.count - a.count);
  const topPillarShare =
    pillarDistribution.length > 0 && recentScripts.length > 0
      ? Math.round((pillarDistribution[0].count / recentScripts.length) * 100)
      : 0;

  return {
    totals: {
      scripts: totalScriptsResult.count ?? 0,
      batches: batchesResult.length,
      conversations: conversationsResult,
    },
    recentBatches: batchesResult,
    recentScripts,
    funnel,
    funnelPercent: pct,
    funnelGap,
    pillarDistribution,
    topPillarShare,
  };
}

export interface DashboardSuggestion {
  kind: "funnel_gap" | "pillar_imbalance" | "no_data";
  text: string;
}

/**
 * Apply the methodology's analyst recommendation patterns to the
 * dashboard snapshot. Returns at most 3 suggestions so the UI does not
 * become a wall of advice.
 */
export function buildSuggestions(snapshot: DashboardSnapshot): DashboardSuggestion[] {
  const out: DashboardSuggestion[] = [];

  if (snapshot.totals.scripts === 0) {
    return [
      {
        kind: "no_data",
        text: "Generate your first batch to start seeing pillar balance, funnel coverage, and content suggestions.",
      },
    ];
  }

  if (snapshot.funnel.total === 0) {
    out.push({
      kind: "no_data",
      text: "Older scripts do not yet carry funnel labels. Newly generated batches will populate this chart automatically.",
    });
  } else {
    for (const gap of snapshot.funnelGap) {
      if (gap.deltaPct <= -25) {
        const stageLabel =
          gap.stage === "TOF"
            ? "Connect (TOF) content"
            : gap.stage === "MOF"
              ? "Nurture (MOF) content"
              : "Convert (BOF) content";
        out.push({
          kind: "funnel_gap",
          text: `You are under-indexed on ${stageLabel} by ${Math.abs(gap.deltaPct)} percentage points. Add at least one piece next batch.`,
        });
      }
    }
  }

  if (snapshot.topPillarShare >= 60 && snapshot.pillarDistribution.length > 1) {
    const top = snapshot.pillarDistribution[0];
    out.push({
      kind: "pillar_imbalance",
      text: `${snapshot.topPillarShare}% of your recent scripts ladder to "${top.pillar}". Spread the next batch across other pillars.`,
    });
  }

  return out.slice(0, 3);
}
