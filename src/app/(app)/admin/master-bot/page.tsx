import Link from "next/link";

import { Topbar } from "@/components/app-shell/topbar";
import { isAdmin } from "@/engines/admin/auth";
import {
  listActiveRules,
  listMasterBotMessages,
  listPendingProposals,
  listRecentHouseVersions,
} from "@/engines/master-bot/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseAdminClient } from "@/lib/shared/supabase/admin";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { MasterBotChat } from "./master-bot-chat";
import { ProposalCard } from "./proposal-card";
import { RulesList } from "./rules-list";

const log = createLogger("page.admin.master-bot");

export const metadata = {
  title: "Master Bot · Bot OS Admin",
};

export default async function MasterBotPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user)) {
    log.warn("non-admin viewed master-bot", { user_id: user?.id });
    return (
      <>
        <Topbar title="Master Bot" />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Admin only</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--oo-text-dim)" }}>
            This page edits the methodology that every engine uses. Gated.
          </p>
        </main>
      </>
    );
  }

  const admin = createSupabaseAdminClient();
  const [messages, rules, proposals, versions] = await Promise.all([
    listMasterBotMessages(admin, { limit: 100 }),
    listActiveRules(admin),
    listPendingProposals(admin),
    listRecentHouseVersions(admin, { limit: 10 }),
  ]);

  log.info("master-bot page viewed", {
    user_id: user?.id,
    message_count: messages.length,
    rule_count: rules.length,
    pending_count: proposals.length,
  });

  return (
    <>
      <Topbar title="Master Bot" />
      <div className="flex flex-1 overflow-hidden">
        <section className="flex flex-1 flex-col overflow-hidden">
          <MasterBotChat initialMessages={messages} />
        </section>

        <aside
          className="hidden w-96 shrink-0 flex-col overflow-y-auto p-5 md:flex"
          style={{ borderLeft: "1px solid var(--oo-border)", background: "var(--oo-bg-raised)" }}
        >
          {proposals.length > 0 ? (
            <div className="mb-5">
              <h3
                className="mb-2 text-xs font-bold uppercase tracking-wide"
                style={{ color: "var(--oo-gold)" }}
              >
                Pending proposals
              </h3>
              <div className="flex flex-col gap-3">
                {proposals.map((p) => (
                  <ProposalCard key={p.id} proposal={p} />
                ))}
              </div>
            </div>
          ) : null}

          <RulesList rules={rules} />

          {versions.length > 0 ? (
            <div className="mt-6">
              <h3
                className="mb-2 text-xs font-bold uppercase tracking-wide"
                style={{ color: "var(--oo-text-dim)" }}
              >
                Recent house edits
              </h3>
              <ul className="flex flex-col gap-2 text-xs">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="rounded-md p-2"
                    style={{
                      background: "var(--oo-bg)",
                      border: "1px solid var(--oo-border-subtle)",
                    }}
                  >
                    <p
                      className="font-semibold capitalize"
                      style={{ color: "var(--oo-text-primary)" }}
                    >
                      {v.slice}
                    </p>
                    <p
                      className="mt-1 leading-relaxed"
                      style={{ color: "var(--oo-text-secondary)" }}
                    >
                      {v.summary}
                    </p>
                    <p className="mt-1" style={{ color: "var(--oo-text-dim)" }}>
                      {v.created_at.slice(0, 10)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 text-[11px]" style={{ color: "var(--oo-text-dim)" }}>
            <Link href="/admin">Back to admin</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
