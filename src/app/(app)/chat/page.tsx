import { redirect } from "next/navigation";

import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { startConversation } from "./actions";
import { ChatInput } from "./chat-input";
import { PromptCards } from "./prompt-cards";

const log = createLogger("page.chat");

export const metadata = {
  title: "Chat · Bot OS",
};

/**
 * Build the empty-state prompt cards from the user's Voice DNA so they
 * reference real pillar names instead of placeholder text. Falls back to
 * pillar-agnostic phrasing when DNA has no pillars (shouldn't happen post-
 * onboarding, but cheap to guard).
 */
function buildSuggestedPrompts(pillarNames: string[]): string[] {
  const first = pillarNames[0];
  const second = pillarNames[1] ?? first;
  return [
    first
      ? `Give me 3 hook ideas for my "${first}" pillar.`
      : "Give me 3 hook ideas grounded in my Voice DNA.",
    "Critique this hook against SCCCC: ...",
    second
      ? `What is a Connection Point I am missing for my "${second}" pillar?`
      : "What is a Connection Point I am missing in this draft?",
    "Plan my week of content across the Trust Funnel.",
  ];
}

export default async function ChatHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // The chat layout already gates on Voice DNA, so dna is non-null in
  // practice. We refetch here to extract the pillar names for the
  // suggested-prompt seeds; cheap single-row read.
  const dna = await getCurrentVoiceDNA(supabase, user.id);
  const pillarNames = dna?.content_pillars.map((p) => p.name) ?? [];
  const suggestedPrompts = buildSuggestedPrompts(pillarNames);

  log.debug("chat empty state rendered", {
    user_id: user.id,
    pillar_count: pillarNames.length,
  });

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
        <div
          className="flex size-12 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{
            background: "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
          }}
        >
          O
        </div>
        <p
          className="text-sm font-medium"
          style={{ color: "var(--oo-text-secondary)" }}
        >
          How can I help you today?
        </p>
        <PromptCards prompts={suggestedPrompts} />
      </div>
      <div
        className="p-4"
        style={{
          borderTop: "1px solid var(--oo-border)",
          background: "var(--oo-bg)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ChatInput
            action={startConversation}
            placeholder="Ask anything..."
            resetOnSuccess={false}
          />
        </div>
      </div>
    </>
  );
}

