/**
 * Shared rendering primitives for chat surfaces:
 *   - MessageBubble: persisted or optimistic message rows
 *   - TypingIndicator: assistant-shaped bubble with three pulsing dots
 *
 * Used by both ConversationView (existing threads) and ChatHome
 * (the empty-state page, which flips into a conversation view once
 * the user submits).
 */

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
}

export function MessageBubble({
  role,
  content,
}: {
  role: ChatMessageRole;
  content: string;
}) {
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
            background:
              "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
            boxShadow: "var(--oo-card-shadow)",
          }}
        >
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {content}
          </pre>
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
          background:
            "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
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
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className="mr-3 mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--oo-gold), var(--oo-gold-bright))",
        }}
      >
        O
      </div>
      <div
        className="flex items-center gap-1.5 rounded-2xl px-4 py-3.5"
        style={{
          background: "var(--oo-bg-raised)",
          border: "1px solid var(--oo-border)",
          boxShadow: "var(--oo-card-shadow)",
        }}
        aria-label="Assistant is typing"
        role="status"
      >
        {[0, 200, 400].map((delay) => (
          <span
            key={delay}
            className="size-1.5 rounded-full animate-pulse"
            style={{
              background: "var(--oo-text-dim)",
              animationDelay: `${delay}ms`,
              animationDuration: "1.2s",
            }}
          />
        ))}
      </div>
    </div>
  );
}
