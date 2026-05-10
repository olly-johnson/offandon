"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { ChatEngine } from "@/engines/chat/chat-engine";
import {
  appendMessage,
  createConversation,
  getConversationWithMessages,
  toEngineHistory,
} from "@/engines/chat/persistence";
import { AnthropicLLMClient } from "@/engines/voice/anthropic-client";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { SlopError } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("chat.actions");

const TITLE_FALLBACK = "New conversation";

export type SendState = { error?: string };

/**
 * Start a brand-new conversation from the /chat list page. Title is derived
 * from the first user message; we redirect to /chat/[id] which renders the
 * thread.
 *
 * The first message is persisted, then the assistant reply is generated
 * synchronously and persisted. Sync is fine here because chat replies are
 * short (~5s); the user is waiting for the page transition either way.
 */
export async function startConversation(_prev: SendState, form: FormData): Promise<SendState> {
  const message = (form.get("message") ?? "").toString().trim();
  if (message.length === 0) {
    return { error: "Type a message before sending." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("startConversation without user");
    redirect("/signin");
  }

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) {
    log.warn("startConversation without DNA", { user_id: user.id });
    return { error: "You need to complete onboarding before we can chat." };
  }

  let conversationId: string;
  try {
    conversationId = await createConversation(supabase, {
      userId: user.id,
      title: message || TITLE_FALLBACK,
    });
  } catch (err) {
    log.error("createConversation failed", { user_id: user.id, error: err });
    return { error: "Could not start the conversation. Try again." };
  }

  try {
    await appendMessage(supabase, {
      conversationId,
      userId: user.id,
      role: "user",
      content: message,
    });

    const engine = new ChatEngine({ llm: new AnthropicLLMClient() });
    const reply = await engine.reply({
      voiceDna: dna,
      history: [{ role: "user", content: message }],
    });

    await appendMessage(supabase, {
      conversationId,
      userId: user.id,
      role: "assistant",
      content: reply.message.content,
    });

    log.info("conversation started", { conversation_id: conversationId, user_id: user.id });
  } catch (err) {
    log.error("startConversation reply failed", {
      conversation_id: conversationId,
      user_id: user.id,
      error: err,
      slop: err instanceof SlopError,
    });
    // Conversation row exists. Surface a system message so the user can retry.
    try {
      await appendMessage(supabase, {
        conversationId,
        userId: user.id,
        role: "system",
        content:
          err instanceof SlopError
            ? "Reply rejected by the anti-slop validator. Try rephrasing."
            : "Could not generate a reply. Try sending again.",
      });
    } catch (writeErr) {
      log.error("system message write failed", { conversation_id: conversationId, writeErr });
    }
  }

  redirect(`/chat/${conversationId}`);
}

/**
 * Send a message inside an existing conversation. Persists user turn,
 * loads full history, asks the engine for a reply, persists assistant turn.
 *
 * On engine failure (network, slop), persists a system note and returns
 * gracefully so the user sees the error inline rather than a 500.
 */
export async function sendMessage(
  conversationId: string,
  _prev: SendState,
  form: FormData,
): Promise<SendState> {
  const message = (form.get("message") ?? "").toString().trim();
  if (message.length === 0) {
    return { error: "Type a message before sending." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("sendMessage without user");
    redirect("/signin");
  }

  const dna = await getCurrentVoiceDNA(supabase, user.id);
  if (!dna) {
    log.warn("sendMessage without DNA", { user_id: user.id });
    return { error: "You need to complete onboarding before we can chat." };
  }

  const loaded = await getConversationWithMessages(supabase, conversationId);
  if (!loaded) {
    return { error: "Conversation not found." };
  }

  try {
    await appendMessage(supabase, {
      conversationId,
      userId: user.id,
      role: "user",
      content: message,
    });

    const history = toEngineHistory(loaded.messages.filter((m) => m.role !== "system"));
    history.push({ role: "user", content: message });

    const engine = new ChatEngine({ llm: new AnthropicLLMClient() });
    const reply = await engine.reply({ voiceDna: dna, history });

    await appendMessage(supabase, {
      conversationId,
      userId: user.id,
      role: "assistant",
      content: reply.message.content,
    });

    log.info("message exchanged", {
      conversation_id: conversationId,
      user_id: user.id,
      history_length: history.length,
    });
  } catch (err) {
    log.error("sendMessage reply failed", {
      conversation_id: conversationId,
      user_id: user.id,
      slop: err instanceof SlopError,
      error: err,
    });
    try {
      await appendMessage(supabase, {
        conversationId,
        userId: user.id,
        role: "system",
        content:
          err instanceof SlopError
            ? "Reply rejected by the anti-slop validator. Try rephrasing."
            : "Could not generate a reply. Try sending again.",
      });
    } catch (writeErr) {
      log.error("system message write failed", { conversation_id: conversationId, writeErr });
    }
  }

  revalidatePath(`/chat/${conversationId}`);
  return {};
}
