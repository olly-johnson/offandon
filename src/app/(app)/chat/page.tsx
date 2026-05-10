import { redirect } from "next/navigation";

import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { startConversation } from "./actions";
import { ChatInput } from "./chat-input";

const log = createLogger("page.chat");

export const metadata = {
  title: "Chat · Bot OS",
};

const SUGGESTED_PROMPTS = [
  "Give me 3 hook ideas for the contrarian beliefs pillar.",
  "Critique this hook against SCCCC: ...",
  "What is a Connection Point I am missing in this draft?",
  "Plan my week of content across the Trust Funnel.",
];

export default async function ChatHomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  log.debug("chat empty state rendered", { user_id: user.id });

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
        <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <PromptCard key={p} text={p} />
          ))}
        </div>
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

function PromptCard({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs leading-relaxed"
      style={{
        background: "var(--oo-bg-raised)",
        border: "1px solid var(--oo-border)",
        color: "var(--oo-text-secondary)",
      }}
    >
      {text}
    </div>
  );
}
