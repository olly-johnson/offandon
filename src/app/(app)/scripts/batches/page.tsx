import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { listBatchesForUser } from "@/engines/content/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { Topbar } from "@/components/app-shell/topbar";

import { AutoRefresh } from "./auto-refresh";
import { GenerateButton } from "./generate-button";
import { StatusBadge } from "./status-badge";

const log = createLogger("page.scripts.batches");

export const metadata = {
  title: "Weekly batches . Bot OS",
};

export default async function BatchesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const batches = await listBatchesForUser(supabase, user.id, 20);
  const hasInFlight = batches.some(
    (b) => b.status === "pending" || b.status === "running",
  );

  log.debug("batches page rendered", {
    user_id: user.id,
    batch_count: batches.length,
    in_flight: hasInFlight,
  });

  return (
    <>
      <Topbar title="Weekly batches" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col">
          {hasInFlight ? <AutoRefresh /> : null}

          <Link
            href="/scripts"
            className="mb-4 inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <ArrowLeft className="size-3.5" />
            Back to Scripts
          </Link>

          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2
                className="text-2xl font-bold"
                style={{
                  color: "var(--oo-text-primary)",
                  letterSpacing: "-0.03em",
                }}
              >
                Weekly batches
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                Bot OS generates 7 scripts per batch, grounded in your Voice DNA.
                Each batch runs in the background.
              </p>
            </div>
            <GenerateButton disabled={hasInFlight} />
          </header>

          {batches.length === 0 ? (
            <div className="oo-card-static p-10 text-center">
              <p
                className="text-sm"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                No batches yet. Hit &ldquo;Generate this week&rdquo; to kick off
                the first one.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {batches.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/scripts/batches/${b.id}`}
                    className="oo-card flex items-center justify-between gap-4 p-5"
                  >
                    <div className="flex flex-col gap-1">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--oo-text-primary)" }}
                      >
                        Batch of {b.count_requested}
                        {b.count_generated > 0 &&
                        b.count_generated !== b.count_requested
                          ? ` (${b.count_generated} generated)`
                          : ""}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--oo-text-secondary)" }}
                      >
                        Started {formatRelative(b.created_at)}
                        {b.completed_at
                          ? `, finished in ${diffSec(
                              b.created_at,
                              b.completed_at,
                            )}s`
                          : ""}
                      </p>
                      {b.failure_reason ? (
                        <p
                          className="text-xs"
                          style={{ color: "var(--oo-bof)" }}
                        >
                          {b.failure_reason}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
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

function diffSec(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 1000,
  );
}
