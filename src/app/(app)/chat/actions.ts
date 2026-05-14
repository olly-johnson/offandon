"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { buildUsageRecorder } from "@/engines/admin/usage-recorder";
import { ChatEngine } from "@/engines/chat/chat-engine";
import {
  appendMessage,
  createConversation,
  deleteConversation as deleteConversationRow,
  getConversationWithMessages,
  toEngineHistory,
} from "@/engines/chat/persistence";
import type { ChatToolDefinition } from "@/engines/chat/types";
import { saveIdea } from "@/engines/content/ideas-persistence";
import { listMemoriesForUser } from "@/engines/memory/persistence";
import { runMemoryExtractor } from "@/engines/memory/run-extractor";
import { getUserMethodology } from "@/engines/methodology/persistence";
import {
  AnthropicLLMClient,
  MEMORY_EXTRACTOR_MODEL,
} from "@/engines/voice/anthropic-client";
import { getCurrentVoiceDNA } from "@/engines/voice/persistence";
import { SlopError } from "@/lib/shared/anti-slop";
import { createLogger } from "@/lib/shared/logger";
import { createSupabaseServerClient } from "@/lib/shared/supabase/server";

const log = createLogger("chat.actions");

const TITLE_FALLBACK = "New conversation";

export type SendState = { error?: string };

/**
 * Build the save_idea tool for the chat engine, scoped to the calling
 * user + conversation. The handler runs server-side inside the engine's
 * tool loop; whatever it returns gets fed back to the LLM as a
 * tool_result.
 *
 * We do not link message_id because the trigger message (the user's
 * "save that as an idea" turn) hasn't been persisted yet at the time
 * this tool fires, and the upcoming assistant message id isn't known
 * either. Conversation linkage is enough provenance.
 */
function buildSaveIdeaTool(args: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  conversationId: string;
}): ChatToolDefinition {
  return {
    name: "save_idea",
    description:
      "Save a short content idea to the user's Ideas Bank. Call this when the user explicitly asks to save something as an idea (for example: 'save that as an idea', 'put that in my ideas bank', 'remember this for later'). Capture the idea in their own words; do not paraphrase.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "The idea text in 1 to 2 sentences. Be specific. No fluff or editorial framing.",
        },
        pillar: {
          type: "string",
          description:
            "Optional. The content pillar this idea ladders into, if the user named one or you can infer one confidently.",
        },
      },
      required: ["content"],
    },
    handler: async (input) => {
      const content = typeof input.content === "string" ? input.content : "";
      const pillar = typeof input.pillar === "string" ? input.pillar : undefined;
      if (content.trim().length === 0) {
        return "Error: content was empty; nothing saved.";
      }
      try {
        const id = await saveIdea(args.supabase, {
          userId: args.userId,
          content,
          source: "chat",
          conversationId: args.conversationId,
          pillar,
        });
        log.info("idea saved via tool-use", {
          idea_id: id,
          user_id: args.userId,
          conversation_id: args.conversationId,
          pillar_set: pillar !== undefined,
        });
        return `Saved as idea ${id}.`;
      } catch (err) {
        log.error("save_idea tool failed", {
          user_id: args.userId,
          conversation_id: args.conversationId,
          error: err instanceof Error ? err.message : String(err),
        });
        return `Error saving idea: ${
          err instanceof Error ? err.message : "unknown"
        }`;
      }
    },
  };
}

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

    const tool = buildSaveIdeaTool({
      supabase,
      userId: user.id,
      conversationId,
    });

    const [memories, userMethodology] = await Promise.all([
      listMemoriesForUser(supabase, user.id, 8),
      getUserMethodology(supabase, user.id),
    ]);

    const engine = new ChatEngine({
      llm: new AnthropicLLMClient({
        onUsage: buildUsageRecorder({ userId: user.id, surface: "chat" }),
      }),
    });
    const reply = await engine.reply({
      voiceDna: dna,
      history: [{ role: "user", content: message }],
      tools: [tool],
      memories,
      userMethodology,
    });

    await appendMessage(supabase, {
      conversationId,
      userId: user.id,
      role: "assistant",
      content: reply.message.content,
    });

    log.info("conversation started", {
      conversation_id: conversationId,
      user_id: user.id,
      tool_call_count: reply.tool_actions.length,
    });

    // Post-chat memory extraction runs AFTER the response is sent so it
    // doesn't add latency to the user's first reply. Best-effort, swallows
    // its own errors.
    const assistantContent = reply.message.content;
    after(async () => {
      await runMemoryExtractor({
        supabase,
        llm: new AnthropicLLMClient({
          model: MEMORY_EXTRACTOR_MODEL,
          onUsage: buildUsageRecorder({ userId: user.id, surface: "memory_extract" }),
        }),
        voiceDna: dna,
        userId: user.id,
        conversationId,
        recentTurns: [
          { role: "user", content: message },
          { role: "assistant", content: assistantContent },
        ],
      });
    });
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

    const tool = buildSaveIdeaTool({
      supabase,
      userId: user.id,
      conversationId,
    });

    const [memories, userMethodology] = await Promise.all([
      listMemoriesForUser(supabase, user.id, 8),
      getUserMethodology(supabase, user.id),
    ]);

    const engine = new ChatEngine({
      llm: new AnthropicLLMClient({
        onUsage: buildUsageRecorder({ userId: user.id, surface: "chat" }),
      }),
    });
    const reply = await engine.reply({
      voiceDna: dna,
      history,
      tools: [tool],
      memories,
      userMethodology,
    });

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
      tool_call_count: reply.tool_actions.length,
    });

    // Post-chat memory extraction. Runs in the background via after() so
    // it doesn't block revalidatePath / the next render. Best-effort.
    const assistantContent = reply.message.content;
    after(async () => {
      await runMemoryExtractor({
        supabase,
        llm: new AnthropicLLMClient({
          model: MEMORY_EXTRACTOR_MODEL,
          onUsage: buildUsageRecorder({ userId: user.id, surface: "memory_extract" }),
        }),
        voiceDna: dna,
        userId: user.id,
        conversationId,
        recentTurns: [
          { role: "user", content: message },
          { role: "assistant", content: assistantContent },
        ],
      });
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

/**
 * Delete a conversation owned by the caller. RLS restricts the row set
 * to the user's own conversations; messages cascade via the FK. Revalidates
 * /chat so the rail re-fetches without the deleted row, then redirects to
 * /chat if the user was viewing the deleted thread.
 *
 * Called directly from a client component button (not as a form action),
 * so the signature is plain (id) -> Promise<SendState>. The return shape
 * still matches SendState so future callers can read {error?} for inline
 * feedback if needed.
 */
export async function deleteConversation(
  conversationId: string,
): Promise<SendState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    log.warn("deleteConversation without user");
    redirect("/signin");
  }

  if (!conversationId) {
    return { error: "Missing conversation id." };
  }

  try {
    const count = await deleteConversationRow(supabase, conversationId);
    if (count === 0) {
      log.warn("deleteConversation no-op (id not owned or already gone)", {
        conversation_id: conversationId,
        user_id: user.id,
      });
      return { error: "Could not delete this conversation." };
    }
    log.info("conversation deleted", {
      conversation_id: conversationId,
      user_id: user.id,
    });
  } catch (err) {
    log.error("deleteConversation failed", {
      conversation_id: conversationId,
      user_id: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "Could not delete. Try again." };
  }

  revalidatePath("/chat");
  redirect("/chat");
}
