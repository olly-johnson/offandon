import { redirect } from "next/navigation";

import { listConversationsForUser } from "@/engines/chat/persistence";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { ChatRail } from "./chat-rail";

/**
 * Layout for the chat surface. Fills the main area of the (app) shell
 * with a two-column split: the persistent left rail (conversation list
 * + New chat) and the active conversation pane on the right.
 *
 * Auth + Voice DNA gates live here so child pages do not have to
 * repeat them. The (app) layout already verifies the user and profile;
 * we additionally require Voice DNA because chat replies are generated
 * against it.
 */
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) redirect("/onboarding");

  const conversations = await listConversationsForUser(supabase, user.id, 30);

  return (
    <div className="flex h-full overflow-hidden">
      <ChatRail
        conversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updated_at: c.updated_at,
        }))}
      />
      <div
        className="flex flex-1 flex-col overflow-hidden"
        style={{ background: "var(--oo-bg)" }}
      >
        {children}
      </div>
    </div>
  );
}
