import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";

import { getBatch } from "@/engines/content/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { Topbar } from "@/components/app-shell/topbar";

import { AutoRefresh } from "../auto-refresh";
import { StatusBadge } from "../status-badge";

const log = createLogger("page.scripts.batch");

export const metadata = {
  title: "Batch . Bot OS",
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
      <Topbar title={`Batch . ${batch.status}`} />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-4xl flex-col">
          {inFlight ? <AutoRefresh /> : null}

          <Link
            href="/scripts/batches"
            className="mb-4 inline-flex items-center gap-1.5 text-xs"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <ArrowLeft className="size-3.5" />
            All batches
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
                Batch
              </h2>
              <p
                className="mt-1 text-sm"
                style={{ color: "var(--oo-text-secondary)" }}
              >
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
            <div
              className="mb-6 rounded-xl p-4 text-sm"
              style={{
                background: "rgba(192,57,43,0.06)",
                border: "1px solid rgba(192,57,43,0.25)",
              }}
            >
              <p className="font-semibold" style={{ color: "var(--oo-bof)" }}>
                Generation failed.
              </p>
              <p
                className="mt-1"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                {batch.failure_reason ?? "Unknown error."}
              </p>
            </div>
          ) : null}

          {inFlight ? (
            <div
              className="mb-6 flex items-center gap-3 rounded-xl px-5 py-4 text-sm"
              style={{
                background: "var(--oo-gold-dim)",
                border: "1px solid var(--oo-border-gold)",
              }}
            >
              <Loader2
                className="oo-spin size-4"
                style={{ color: "var(--oo-gold)" }}
              />
              <p style={{ color: "var(--oo-gold)" }}>
                Claude is generating {batch.count_requested} scripts. This page
                refreshes automatically every few seconds.
              </p>
            </div>
          ) : null}

          {scripts.length === 0 && !inFlight && batch.status !== "failed" ? (
            <div className="oo-card-static p-8 text-center">
              <p
                className="text-sm"
                style={{ color: "var(--oo-text-secondary)" }}
              >
                No scripts in this batch yet.
              </p>
            </div>
          ) : null}

          <ol className="flex flex-col gap-4">
            {scripts.map((s, i) => (
              <li key={s.id} className="oo-card-static p-6">
                <p className="label-xs">Script {i + 1}</p>
                <p
                  className="mt-3 text-base font-semibold leading-snug"
                  style={{ color: "var(--oo-text-primary)" }}
                >
                  {s.hook}
                </p>
                <p
                  className="mt-3 whitespace-pre-wrap text-sm leading-relaxed"
                  style={{ color: "var(--oo-text-secondary)" }}
                >
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </>
  );
}
