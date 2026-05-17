import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("page.transcripts.detail");

export const metadata = {
  title: "Transcript · Bot OS",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TranscriptDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data, error } = await supabase
    .from("client_documents")
    .select("id, title, body, captured_at, metadata, source_type, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("source_type", "fathom_transcript")
    .maybeSingle();

  if (error) {
    log.error("detail query failed", { id, user_id: user.id, message: error.message });
  }
  if (!data) notFound();

  const metadata =
    data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : {};
  const shareUrl = typeof metadata.share_url === "string" ? metadata.share_url : null;
  const invitees = Array.isArray(metadata.invitees) ? metadata.invitees : [];

  return (
    <>
      <Topbar title="Transcript" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4">
            <Link
              href="/transcripts"
              className="text-xs"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              ← Back to all transcripts
            </Link>
          </div>

          <header className="mb-6">
            <h2
              className="text-2xl font-bold"
              style={{
                color: "var(--oo-text-primary)",
                letterSpacing: "-0.03em",
              }}
            >
              {data.title}
            </h2>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--oo-text-dim)" }}
            >
              <time dateTime={data.captured_at}>{formatDate(data.captured_at)}</time>
              {invitees.length > 0 ? (
                <>
                  {" · "}
                  {summariseInvitees(invitees)}
                </>
              ) : null}
              {shareUrl ? (
                <>
                  {" · "}
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: "var(--oo-gold)" }}
                  >
                    Open in Fathom
                  </a>
                </>
              ) : null}
            </p>
          </header>

          <article
            className="whitespace-pre-wrap rounded-xl p-5 text-sm leading-relaxed"
            style={{
              background: "var(--oo-bg-raised)",
              border: "1px solid var(--oo-border)",
              color: "var(--oo-text-primary)",
              fontFamily: "var(--oo-font-reading, inherit)",
            }}
          >
            {data.body}
          </article>
        </div>
      </div>
    </>
  );
}

function summariseInvitees(invitees: unknown[]): string {
  const names = invitees
    .map((inv) =>
      inv && typeof inv === "object"
        ? ((inv as Record<string, unknown>).name as string | null) ??
          ((inv as Record<string, unknown>).email as string | null)
        : null,
    )
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return names.length > 0 ? names.join(", ") : "Fathom recording";
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
