import { notFound, redirect } from "next/navigation";

import { getConversationWithMessages } from "@/engines/chat/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { sendMessage } from "../actions";
import { ChatInput } from "../chat-input";

const log = createLogger("page.chat.detail");

export const metadata = {
  title: "Conversation · Bot OS",
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const result = await getConversationWithMessages(supabase, id);
  if (!result) notFound();

  log.debug("conversation rendered", {
    user_id: user.id,
    conversation_id: id,
    message_count: result.messages.length,
  });

  // Bind the conversation id to the server action so the ChatInput can
  // call it with just (prev, form). Bound server actions stay server
  // actions; the binding survives the client boundary.
  const action = sendMessage.bind(null, id);

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
        {result.messages.length === 0 ? (
          <p
            className="text-center text-sm"
            style={{ color: "var(--oo-text-dim)" }}
          >
            No messages in this conversation yet.
          </p>
        ) : (
          result.messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))
        )}
      </div>
      <div
        className="p-4"
        style={{
          borderTop: "1px solid var(--oo-border)",
          background: "var(--oo-bg)",
        }}
      >
        <div className="mx-auto max-w-3xl">
          <ChatInput action={action} placeholder="Reply..." resetOnSuccess />
        </div>
      </div>
    </>
  );
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  if (role === "system") {
    return (
      <div className="self-center">
        <p
          className="rounded-lg px-3 py-2 text-xs"
          style={{
            color: "var(--oo-text-dim)",
            border: "1px dashed var(--oo-border)",
            background: "var(--oo-bg-raised)",
          }}
        >
          {content}
        </p>
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[70%] rounded-2xl px-4 py-3 text-sm font-medium leading-relaxed text-white"
          style={{
            background: "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
            boxShadow: "var(--oo-card-shadow)",
          }}
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{content}</pre>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div
        className="mr-3 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{
          background: "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
        }}
      >
        O
      </div>
      <div
        className="max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={{
          background: "var(--oo-bg-raised)",
          border: "1px solid var(--oo-border)",
          color: "var(--oo-text-primary)",
          boxShadow: "var(--oo-card-shadow)",
        }}
      >
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{content}</pre>
      </div>
    </div>
  );
}
