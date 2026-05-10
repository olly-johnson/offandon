import Link from "next/link";
import { redirect } from "next/navigation";

import { listConversationsForUser } from "@/engines/chat/persistence";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

import { NewConversationForm } from "./new-conversation-form";

const log = createLogger("page.chat");

export const metadata = {
  title: "Chat · Bot OS",
};

export default async function ChatListPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [dna, conversations] = await Promise.all([
    getCurrentVoiceDNA(supabase, user.id),
    listConversationsForUser(supabase, user.id, 30),
  ]);

  log.debug("chat list rendered", { user_id: user.id, count: conversations.length });

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Think out loud with your Bot OS. Replies are grounded in your Voice DNA.
        </p>
      </header>

      {dna ? (
        <section className="mb-10 rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
            Start a new conversation
          </h2>
          <NewConversationForm />
        </section>
      ) : (
        <section className="mb-10 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Finish onboarding before chatting.{" "}
          <Link href="/onboarding" className="text-primary underline">
            Run onboarding
          </Link>
          .
        </section>
      )}

      {conversations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No conversations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {conversations.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-border bg-card transition-colors hover:bg-muted/30"
            >
              <Link href={`/chat/${c.id}`} className="flex items-center justify-between gap-4 p-4">
                <span className="text-sm">{c.title ?? "Untitled"}</span>
                <span className="text-xs text-muted-foreground">{formatRelative(c.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
