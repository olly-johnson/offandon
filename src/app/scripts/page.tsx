import Link from "next/link";
import { redirect } from "next/navigation";

import { listBatchesForUser } from "@/engines/content/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { AutoRefresh } from "./auto-refresh";
import { GenerateButton } from "./generate-button";
import { StatusBadge } from "./status-badge";

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

  const batches = await listBatchesForUser(supabase, user.id, 20);
  const hasInFlight = batches.some((b) => b.status === "pending" || b.status === "running");

  log.debug("scripts page rendered", { user_id: user.id, batch_count: batches.length, in_flight: hasInFlight });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      {hasInFlight ? <AutoRefresh /> : null}

      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Scripts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bot OS generates 7 scripts per batch, grounded in your Voice DNA.
          </p>
        </div>
        <GenerateButton disabled={hasInFlight} />
      </header>

      {batches.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No batches yet. Hit &ldquo;Generate this week&rdquo; to kick off the first one.
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {batches.map((b) => (
            <li
              key={b.id}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
            >
              <Link href={`/scripts/${b.id}`} className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm">
                    Batch of {b.count_requested}
                    {b.count_generated > 0 && b.count_generated !== b.count_requested
                      ? ` (${b.count_generated} generated)`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Started {formatRelative(b.created_at)}
                    {b.completed_at ? `, finished in ${diffMs(b.created_at, b.completed_at)}s` : ""}
                  </p>
                  {b.failure_reason ? (
                    <p className="text-xs text-destructive">{b.failure_reason}</p>
                  ) : null}
                </div>
                <StatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function diffMs(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}
