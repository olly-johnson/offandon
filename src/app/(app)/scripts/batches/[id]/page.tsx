import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getBatch } from "@/engines/content/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { Topbar } from "@/components/app-shell/topbar";

import { AutoRefresh } from "../auto-refresh";
import { StatusBadge } from "../status-badge";

const log = createLogger("page.scripts.batch");

export const metadata = {
  title: "Batch · Bot OS",
};

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const result = await getBatch(supabase, id);
  if (!result) notFound();

  const { batch, scripts } = result;
  const inFlight = batch.status === "pending" || batch.status === "running";

  log.debug("batch detail rendered", {
    user_id: user.id,
    batch_id: id,
    status: batch.status,
    script_count: scripts.length,
  });

  return (
    <>
      <Topbar title={`Batch · ${batch.status}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col">
          {inFlight ? <AutoRefresh /> : null}

          <Link href="/scripts/batches" className="text-xs text-muted-foreground hover:text-foreground">
            ← All batches
          </Link>

          <header className="mt-4 mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Batch</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Requested {batch.count_requested} scripts.
                {batch.completed_at
                  ? ` Finished in ${Math.round(
                      (new Date(batch.completed_at).getTime() -
                        new Date(batch.created_at).getTime()) /
                        1000,
                    )}s.`
                  : ""}
              </p>
            </div>
            <StatusBadge status={batch.status} />
          </header>

          {batch.status === "failed" ? (
            <section className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm">
              <strong className="text-destructive">Generation failed.</strong>
              <p className="mt-1 text-muted-foreground">
                {batch.failure_reason ?? "Unknown error."}
              </p>
            </section>
          ) : null}

          {inFlight ? (
            <section className="mb-6 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              Claude is generating {batch.count_requested} scripts. Page refreshes automatically
              every few seconds.
            </section>
          ) : null}

          {scripts.length === 0 && !inFlight && batch.status !== "failed" ? (
            <p className="text-sm text-muted-foreground">No scripts in this batch yet.</p>
          ) : null}

          <ol className="flex flex-col gap-6">
            {scripts.map((s, i) => (
              <li key={s.id} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Script {i + 1}</span>
                </div>
                <p className="mt-3 text-lg font-semibold">{s.hook}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
