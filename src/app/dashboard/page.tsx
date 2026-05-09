import Link from "next/link";
import { redirect } from "next/navigation";

import { listBatchesForUser } from "@/engines/content/persistence";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { createLogger } from "@/lib/shared/logger";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { signout } from "./actions";

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

  // No profile = onboarding incomplete.
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) {
    log.debug("no profile, redirecting to /onboarding", { user_id: user.id });
    redirect("/onboarding");
  }

  const [dna, batches] = await Promise.all([
    getCurrentVoiceDNA(supabase, user.id),
    listBatchesForUser(supabase, user.id, 3),
  ]);
  const latestBatch = batches[0] ?? null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.email}</p>
        </div>
        <form action={signout}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </header>

      {dna ? (
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Your Voice DNA</h2>
          <p className="mt-3 text-2xl font-semibold">{dna.tone_profile.primary}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {dna.tone_profile.formality} · {dna.tone_profile.energy} energy ·{" "}
            {dna.tone_profile.descriptors.join(", ")}
          </p>
          <div className="mt-6">
            <h3 className="text-sm font-medium text-foreground">Content pillars</h3>
            <ul className="mt-2 flex flex-col gap-2 text-sm text-muted-foreground">
              {dna.content_pillars.map((p) => (
                <li key={p.name}>
                  <strong className="text-foreground">{p.name}.</strong> {p.description}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No Voice DNA on file yet. <a href="/onboarding" className="text-primary underline">Run onboarding</a>.
        </section>
      )}

      {/* Recent script batches */}
      <section className="mt-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
              Recent script batches
            </h2>
            {latestBatch ? (
              <p className="mt-3 text-sm">
                Latest batch is {batchStatusLabel(latestBatch.status)}
                {latestBatch.status === "complete"
                  ? ` with ${latestBatch.count_generated} script${latestBatch.count_generated === 1 ? "" : "s"}.`
                  : "."}
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                You haven&apos;t generated any scripts yet.
              </p>
            )}
          </div>
          <Link href="/scripts">
            <Button variant="ghost" size="sm">
              {latestBatch ? "Open scripts" : "Generate first batch"}
            </Button>
          </Link>
        </div>
      </section>

      <p className="mt-8 text-xs text-muted-foreground">
        Dashboard is a stub. Chat and IG analytics land in upcoming PRs.
      </p>
    </main>
  );
}

function batchStatusLabel(status: "pending" | "running" | "complete" | "failed"): string {
  switch (status) {
    case "pending":
      return "queued";
    case "running":
      return "generating";
    case "complete":
      return "ready";
    case "failed":
      return "failed";
  }
}
