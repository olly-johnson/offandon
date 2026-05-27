import Link from "next/link";
import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("page.transcripts");

export const metadata = {
  title: "Transcripts · Bot OS",
};

interface TranscriptRow {
  id: string;
  title: string;
  captured_at: string;
  metadata: Record<string, unknown>;
}

export default async function TranscriptsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // RLS limits the result set to the current user's rows already. The
  // explicit user_id filter just helps the query plan and reads cleanly.
  const { data, error } = await supabase
    .from("client_documents")
    .select("id, title, captured_at, metadata")
    .eq("user_id", user.id)
    .eq("source_type", "fathom_transcript")
    .order("captured_at", { ascending: false })
    .limit(200);

  if (error) {
    log.error("list query failed", { user_id: user.id, message: error.message });
  }

  const rows: TranscriptRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    captured_at: r.captured_at,
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
  }));

  return (
    <>
      <Topbar title="Transcripts" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <header className="mb-6">
            <h2
              className="text-2xl font-bold"
              style={{
                color: "var(--oo-text-primary)",
                letterSpacing: "-0.03em",
              }}
            >
              Fathom transcripts
            </h2>
            <p
              className="mt-1 text-sm leading-relaxed"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              Every completed Fathom recording with you on the call. New ones
              arrive automatically once the recording finishes processing.
            </p>
          </header>

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/transcripts/${row.id}`}
                    className="block rounded-xl p-4 transition-all hover:translate-x-0.5"
                    style={{
                      background: "var(--oo-bg-raised)",
                      border: "1px solid var(--oo-border)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3
                        className="text-sm font-semibold"
                        style={{ color: "var(--oo-text-primary)" }}
                      >
                        {row.title}
                      </h3>
                      <time
                        className="text-xs"
                        style={{ color: "var(--oo-text-dim)" }}
                        dateTime={row.captured_at}
                      >
                        {formatDate(row.captured_at)}
                      </time>
                    </div>
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--oo-text-secondary)" }}
                    >
                      {summariseMetadata(row.metadata)}
                    </p>
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

function EmptyState() {
  return (
    <div
      className="rounded-xl p-6 text-sm"
      style={{
        background: "var(--oo-bg-raised)",
        border: "1px solid var(--oo-border)",
        color: "var(--oo-text-secondary)",
      }}
    >
      No transcripts yet. Once your next Fathom call finishes processing it
      will land here automatically.
    </div>
  );
}

function summariseMetadata(meta: Record<string, unknown>): string {
  const invitees = Array.isArray(meta.invitees) ? meta.invitees : [];
  const names = invitees
    .map((inv) =>
      inv && typeof inv === "object"
        ? ((inv as Record<string, unknown>).name as string | null) ??
          ((inv as Record<string, unknown>).email as string | null)
        : null,
    )
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  if (names.length === 0) return "Fathom recording";
  return `With ${names.join(", ")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
