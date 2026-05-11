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

export default async function LibraryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const connection = await getConnection(supabase, user.id);
  const media = connection
    ? await listMediaForUser(supabase, user.id, 30)
    : [];

  log.debug("library page rendered", {
    user_id: user.id,
    connected: connection !== null,
    media_count: media.length,
  });

  return (
    <>
      <Topbar title="Content Library" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col">
          {!connection ? (
            <ConnectEmptyState />
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

function ConnectEmptyState() {
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
          Paste a long-lived Instagram Graph API access token to pull your
          recent posts and engagement into your content library. Followers
          and weekly reach feed the dashboard.
        </p>
      </header>

      <section
        className="oo-card-static mb-4 p-5 text-sm leading-relaxed"
        style={{ color: "var(--oo-text-secondary)" }}
      >
        <p
          className="label-xs mb-2"
          style={{ color: "var(--oo-gold)" }}
        >
          How to get a token
        </p>
        <ol className="ml-5 list-decimal space-y-1.5 text-xs">
          <li>
            Have an Instagram Business or Creator account linked to a Facebook
            Page.
          </li>
          <li>
            Open your Meta Developer Dashboard, create or open an app, and add
            the Instagram Graph API product.
          </li>
          <li>
            In Graph API Explorer, select your IG-linked page and request the
            scopes \`instagram_basic\` and \`instagram_manage_insights\`.
          </li>
          <li>
            Generate a User Access Token, then exchange it for a long-lived
            token (60 days) via the token debugger.
          </li>
          <li>Paste it below.</li>
        </ol>
      </section>

      <ConnectForm />
    </div>
  );
}
