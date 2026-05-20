import { redirect } from "next/navigation";

import { Topbar } from "@/components/app-shell/topbar";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { MethodologyForm } from "./methodology-form";

const log = createLogger("page.methodology");

export const metadata = {
  title: "Methodology · Bot OS",
};

export default async function MethodologyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  log.debug("methodology page rendered", { user_id: user.id });

  return (
    <>
      <Topbar title="Methodology" />
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
              Your methodology
            </h2>
            <p
              className="mt-1 text-sm leading-relaxed"
              style={{ color: "var(--oo-text-secondary)" }}
            >
              Personal rules the assistant follows on top of the house
              methodology. Use this for word bans, preferred metaphors, hook
              styles, or anything the house rules don&apos;t cover. Plain
              text, one rule per line. Each save adds to your existing rules
              and loads into every chat, hook, and script prompt.
            </p>
          </header>

          <section
            className="mb-4 rounded-xl p-4 text-xs leading-relaxed"
            style={{
              background: "var(--oo-bg-elevated)",
              border: "1px solid var(--oo-border-subtle)",
              color: "var(--oo-text-secondary)",
            }}
          >
            <p
              className="font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              Examples
            </p>
            <ul className="mt-2 space-y-1">
              <li>Never use the word &ldquo;unlock&rdquo;.</li>
              <li>Prefer running metaphors over war or fight metaphors.</li>
              <li>
                When suggesting hooks for the Operator Frameworks pillar,
                prefer specific dollar amounts.
              </li>
              <li>
                Address the audience as &ldquo;you&rdquo;, never as
                &ldquo;guys&rdquo;.
              </li>
            </ul>
          </section>

          <MethodologyForm />
        </div>
      </div>
    </>
  );
}
