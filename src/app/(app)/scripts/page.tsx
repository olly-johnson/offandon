import Link from "next/link";
import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import { listIdeasForUser } from "@/engines/content/ideas-persistence";
import { listScriptsForUser } from "@/engines/content/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";

import { ScriptsTabs } from "./tabs";

const log = createLogger("page.scripts");

export const metadata = {
  title: "Scripts · Bot OS",
};

export default async function ScriptsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) {
    return (
      <>
        <Topbar title="Scripts" />
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="oo-card-static max-w-md p-8 text-center">
            <h2
              className="text-xl font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              Finish onboarding first
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              The wizard runs against your Voice DNA.{" "}
              <Link
                href="/onboarding"
                className="underline"
                style={{ color: "var(--oo-gold)" }}
              >
                Run onboarding
              </Link>{" "}
              to unlock it.
            </p>
          </div>
        </div>
      </>
    );
  }

  const [libraryScripts, ideas] = await Promise.all([
    listScriptsForUser(supabase, user.id, 50),
    listIdeasForUser(supabase, user.id, 50),
  ]);
  log.debug("scripts page rendered", {
    user_id: user.id,
    library_count: libraryScripts.length,
    idea_count: ideas.length,
  });

  return (
    <>
      <Topbar title="Scripts" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col">
          <header className="mb-6 flex items-start justify-between gap-3">
            <div>
              <h2
                className="text-2xl font-bold"
                style={{
                  color: "var(--oo-text-primary)",
                  letterSpacing: "-0.03em",
                }}
              >
                Scripts
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--oo-text-secondary)" }}>
                Build a single script step by step, browse your library, or pull from saved
                ideas.
              </p>
            </div>
            <Link href="/scripts/batches">
              <button className="gold-btn-outline px-4 py-2 text-xs">
                Weekly batches &rarr;
              </button>
            </Link>
          </header>

          <ScriptsTabs libraryScripts={libraryScripts} ideas={ideas} />
        </div>
      </div>
    </>
  );
}
