import { notFound, redirect } from "next/navigation";

import { getConversationWithMessages } from "@/engines/chat/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { sendMessage } from "../actions";
import { ConversationView, type ConversationMessage } from "../conversation-view";

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

  // Bind the conversation id to the server action so the form can call it
  // with just (prev, form). Bound server actions stay server actions; the
  // binding survives the client boundary.
  const action = sendMessage.bind(null, id);

  const initialMessages: ConversationMessage[] = result.messages.map((m) => ({
    id: m.id,
    role: m.role as ConversationMessage["role"],
    content: m.content,
  }));

  return <ConversationView initialMessages={initialMessages} action={action} />;
}
