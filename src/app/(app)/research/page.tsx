import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import {
  COMPETITOR_LIMIT_PER_USER,
  listCompetitors,
} from "@/engines/competitor";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { CompetitorList } from "./competitor-list";

const log = createLogger("page.research");

export const metadata = { title: "Research · Bot OS" };

export default async function ResearchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const competitors = await listCompetitors(supabase, user.id);

  log.debug("research page rendered", {
    user_id: user.id,
    competitor_count: competitors.length,
  });

  return (
    <>
      <Topbar title="Research" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col">
          <header className="mb-6 flex items-baseline justify-between gap-4">
            <div>
              <h2
                className="text-2xl font-bold"
                style={{
                  color: "var(--oo-text-primary)",
                  letterSpacing: "-0.03em",
                }}
              >
                Tracked competitors
              </h2>
              <p
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                Pin up to {COMPETITOR_LIMIT_PER_USER} Instagram accounts. Research
                will pull their videos, transcribe them, and surface the hooks,
                formats, and topics that are working. Findings feed back into
                your methodology so chat and scripts can use them.
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

          <section
            className="mb-4 rounded-xl p-3 text-[11px] leading-relaxed"
            style={{
              background: "var(--oo-bg-elevated)",
              border: "1px solid var(--oo-border-subtle)",
              color: "var(--oo-text-dim)",
            }}
            aria-label="Heads up"
          >
            Hit the refresh icon on a tracked account to pull their recent
            reels via Apify. Per-video transcription + structural analysis
            lands in BO-063; for now you&apos;ll see the reel rows populate
            after each sync.
          </section>

          <CompetitorList
            userId={user.id}
            competitors={competitors}
            limit={COMPETITOR_LIMIT_PER_USER}
          />
        </div>
      </div>
    </>
  );
}
