import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import {
  getConnection,
  listMediaForUser,
} from "@/engines/instagram/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ConnectForm } from "./connect-form";
import { LibraryGrid } from "./library-grid";

const log = createLogger("page.library");

export const metadata = {
  title: "Library · Bot OS",
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ ig_error?: string; ig_connected?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [connection, sp] = await Promise.all([
    getConnection(supabase, user.id),
    searchParams,
  ]);
  const media = connection
    ? await listMediaForUser(supabase, user.id, 30)
    : [];

  // Server-side env gate: the paste-a-token fallback exists for local
  // testing, not for clients. Off in production unless explicitly opted
  // in via IG_ALLOW_PASTE_TOKEN=1.
  const allowPasteToken =
    process.env.NODE_ENV !== "production" ||
    process.env.IG_ALLOW_PASTE_TOKEN === "1";

  log.debug("library page rendered", {
    user_id: user.id,
    connected: connection !== null,
    media_count: media.length,
    ig_error: sp.ig_error ?? null,
    ig_connected: sp.ig_connected === "1",
  });

  return (
    <>
      <Topbar title="Content Library" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col">
          {sp.ig_error ? (
            <FlashBanner kind="error" message={sp.ig_error} />
          ) : null}
          {sp.ig_connected === "1" && connection ? (
            <FlashBanner
              kind="ok"
              message={`Connected${
                connection.ig_username ? ` as @${connection.ig_username}` : ""
              }. Initial sync done.`}
            />
          ) : null}

          {!connection ? (
            <ConnectEmptyState allowPasteToken={allowPasteToken} />
          ) : (
            <LibraryGrid
              connection={{
                ig_username: connection.ig_username,
                followers_count: connection.followers_count,
                media_count: connection.media_count,
                last_synced_at: connection.last_synced_at,
                last_sync_error: connection.last_sync_error,
              }}
              media={media}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ConnectEmptyState({ allowPasteToken }: { allowPasteToken: boolean }) {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h2
          className="text-2xl font-bold"
          style={{
            color: "var(--oo-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Connect Instagram
        </h2>
        <p
          className="mt-1 text-sm leading-relaxed"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          Bot OS pulls your recent posts, captions, and engagement into the
          content library. Follower count and weekly reach flow to the
          dashboard. Click below to grant access; you can disconnect at any
          time.
        </p>
      </header>

      <ConnectForm allowPasteToken={allowPasteToken} />
    </div>
  );
}

function FlashBanner({
  kind,
  message,
}: {
  kind: "ok" | "error";
  message: string;
}) {
  const color = kind === "ok" ? "var(--oo-tof)" : "var(--oo-bof)";
  const bg =
    kind === "ok" ? "rgba(22,163,74,0.08)" : "rgba(192,57,43,0.06)";
  const border =
    kind === "ok" ? "rgba(22,163,74,0.20)" : "rgba(192,57,43,0.25)";
  return (
    <div
      className="mb-4 rounded-xl p-3 text-xs"
      role={kind === "error" ? "alert" : "status"}
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {message}
    </div>
  );
}
