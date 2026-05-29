import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import {
  getConnection,
  listMediaForUser,
} from "@/engines/instagram/persistence";
import { getAnalysesForMediaIds } from "@/engines/research";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ConnectForm } from "./connect-form";
import { LibraryGrid } from "./library-grid";
import {
  INSTAGRAM_MANAGE_ACCESS_URL,
  TESTER_INVITE_STEPS,
} from "./tester-invite-steps";

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

  // Load analyses for the visible media so each tile renders its analysis
  // panel inline. Also check which media have been "saved as reference"
  // (i.e. have a client_assets row sourced from this video). Both reads
  // are tiny; one parallel batch.
  const mediaIds = media.map((m) => m.id);
  const [analyses, referencedSet] = await Promise.all([
    mediaIds.length > 0
      ? getAnalysesForMediaIds(supabase, mediaIds)
      : Promise.resolve(new Map()),
    mediaIds.length > 0
      ? loadReferencedMediaIds(user.id, mediaIds)
      : Promise.resolve(new Set<string>()),
  ]);

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
              userId={user.id}
              connection={{
                ig_username: connection.ig_username,
                followers_count: connection.followers_count,
                media_count: connection.media_count,
                last_synced_at: connection.last_synced_at,
                last_sync_error: connection.last_sync_error,
              }}
              media={media}
              analyses={Object.fromEntries(analyses)}
              referencedMediaIds={Array.from(referencedSet)}
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

      <TesterInviteHelp />
    </div>
  );
}

/**
 * Collapsible help for clients who get "Insufficient Developer role" on
 * Instagram's consent screen. That error means they were invited as a
 * Tester but have not accepted the invite yet (acceptance happens on
 * Instagram, not here). Rendered as a native <details> so it needs no
 * client JS. See tester-invite-steps.ts; remove once the app goes Live.
 */
function TesterInviteHelp() {
  return (
    <details
      className="mt-6 rounded-xl p-4"
      style={{
        background: "var(--oo-bg-elevated)",
        border: "1px solid var(--oo-border-subtle)",
      }}
    >
      <summary
        className="cursor-pointer text-sm font-medium"
        style={{ color: "var(--oo-text-primary)" }}
      >
        Seeing &quot;Insufficient Developer role&quot;? Accept your invite first
      </summary>
      <p
        className="mt-2 text-xs leading-relaxed"
        style={{ color: "var(--oo-text-secondary)" }}
      >
        Bot OS is in early access, so each account has to accept a one-time
        invite on Instagram before it can connect. It takes about a minute:
      </p>
      <ol className="mt-3 flex flex-col gap-2">
        {TESTER_INVITE_STEPS.map((step) => (
          <li
            key={step.n}
            className="flex gap-3 text-xs leading-relaxed"
            style={{ color: "var(--oo-text-secondary)" }}
          >
            <span
              className="flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                background: "var(--oo-bg-base)",
                color: "var(--oo-text-primary)",
                border: "1px solid var(--oo-border-subtle)",
              }}
            >
              {step.n}
            </span>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
      <a
        href={INSTAGRAM_MANAGE_ACCESS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs underline"
        style={{ color: "var(--oo-gold, var(--oo-text-primary))" }}
      >
        Open the Instagram invites page
      </a>
    </details>
  );
}

/**
 * Returns the set of media_ids that are already referenced by a
 * client_assets row sourced from Instagram. Used by the grid to render
 * the "Save as reference" button as "Saved" for already-saved videos.
 *
 * Reads through the admin client because client_assets has no
 * authenticated UPDATE/DELETE/INSERT policy (writes are service-role).
 * The SELECT path on client_assets IS open to authenticated, but using
 * the admin client here keeps the read path symmetric with the write
 * paths in actions.ts.
 */
async function loadReferencedMediaIds(
  userId: string,
  mediaIds: string[],
): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  const sourceFiles = mediaIds.map((id) => `instagram:${id}`);
  const { data, error } = await admin
    .from("client_assets")
    .select("source_file")
    .eq("user_id", userId)
    .eq("asset_type", "past_script")
    .in("source_file", sourceFiles);
  if (error) {
    log.warn("loadReferencedMediaIds failed", { user_id: userId, message: error.message });
    return new Set();
  }
  const out = new Set<string>();
  for (const row of data ?? []) {
    const sf = row.source_file as string | null;
    if (sf && sf.startsWith("instagram:")) {
      out.add(sf.slice("instagram:".length));
    }
  }
  return out;
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
