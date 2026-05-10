import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getConversationWithMessages } from "@/engines/chat/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { MessageForm } from "./message-form";

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

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-12">
      <Link href="/chat" className="text-xs text-muted-foreground hover:text-foreground">
        ← All conversations
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {result.conversation.title ?? "Untitled"}
        </h1>
      </header>

      <ol className="flex flex-1 flex-col gap-4">
        {result.messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">No messages in this conversation yet.</li>
        ) : (
          result.messages.map((m) => (
            <li
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end max-w-[85%] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground"
                  : m.role === "assistant"
                    ? "self-start max-w-[85%] rounded-lg border border-border bg-card px-4 py-3 text-sm"
                    : "self-center max-w-[85%] rounded-lg border border-dashed border-border px-4 py-2 text-xs text-muted-foreground"
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </li>
          ))
        )}
      </ol>

      <div className="sticky bottom-0 mt-8 border-t border-border bg-background pt-6">
        <MessageForm conversationId={id} />
      </div>
    </main>
  );
}
