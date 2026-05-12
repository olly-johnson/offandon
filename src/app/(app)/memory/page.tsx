import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import { isAdmin } from "@/engines/admin/auth";
import { listMemoriesForUser } from "@/engines/memory/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { MemoryList } from "./memory-list";

const log = createLogger("page.memory");

export const metadata = {
  title: "Memory · Bot OS",
};

const CATEGORY_LABELS: Record<string, string> = {
  ongoing_project: "Ongoing projects",
  creator_context: "Context",
  preference: "Preferences",
  recent_topic: "Recent topics",
};

export default async function MemoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");
  // Memory is an operator-only inspection surface; clients shouldn't see
  // what the bot has extracted about them. Sidebar nav already hides the
  // link for non-admins; this is defense-in-depth for anyone who types
  // the URL directly.
  if (!isAdmin(user)) redirect("/dashboard");

  const memories = await listMemoriesForUser(supabase, user.id, 100);

  log.debug("memory page rendered", {
    user_id: user.id,
    memory_count: memories.length,
  });

  return (
    <>
      <Topbar title="Memory" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col">
          <header className="mb-6">
            <h2
              className="text-2xl font-bold"
              style={{
                color: "var(--oo-text-primary)",
                letterSpacing: "-0.03em",
              }}
            >
              What Bot OS remembers
            </h2>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              After each chat the assistant extracts a small set of durable
              facts about you and your work. These get pulled into future
              chat replies so you don&apos;t have to re-state context every
              time. Delete anything that&apos;s wrong or outdated.
            </p>
          </header>

          <MemoryList memories={memories} categoryLabels={CATEGORY_LABELS} />
        </div>
      </div>
    </>
  );
}
