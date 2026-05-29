"use client";

import { useMemo, useRef, useState } from "react";
import { Check, CheckCircle, Copy, Send, X } from "lucide-react";

import type {
  GeneratedSingleScript,
  IMF,
  ScriptRefineChatTurn,
  ScriptRefineProposal,
} from "@/engines/content";
import { diffLines, type DiffOp } from "@/lib/shared/text-diff";

import { MessageBubble, TypingIndicator, type ChatMessage } from "../chat/chat-messages";
import { refineScriptChatAction } from "./actions";

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

/** Editable script + chat partner. The chat can propose amendments the
 *  creator reviews as a diff and accepts or rejects. */
export function RefineStudio({
  script,
  concept,
  imf,
  saving,
  savedId,
  saveError,
  onBack,
  onSave,
}: {
  script: GeneratedSingleScript;
  concept: string;
  imf: IMF;
  saving: boolean;
  savedId: string | null;
  saveError: string;
  onBack: () => void;
  onSave: (hook: string, body: string) => void;
}) {
  const [hook, setHook] = useState(script.hook);
  const [body, setBody] = useState(script.body);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [proposal, setProposal] = useState<ScriptRefineProposal | null>(null);

  // Stable client-side ids for optimistic chat rows. A ref counter avoids
  // Math.random / Date.now and keeps keys deterministic across renders.
  const idRef = useRef(0);
  const nextId = () => `m${idRef.current++}`;

  const locked = proposal !== null;

  async function send() {
    const text = input.trim();
    if (!text || sending || locked) return;

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setChatError("");
    setSending(true);

    const history: ScriptRefineChatTurn[] = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const res = await refineScriptChatAction({
      concept,
      imf,
      currentScript: { hook, body },
      history,
    });
    setSending(false);

    if ("error" in res) {
      setChatError(res.error);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "assistant", content: res.reply },
    ]);
    if (res.proposal) setProposal(res.proposal);
  }

  function acceptProposal() {
    if (!proposal) return;
    setHook(proposal.hook);
    setBody(proposal.body);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "system", content: "Changes accepted." },
    ]);
    setProposal(null);
  }

  function rejectProposal() {
    if (!proposal) return;
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "system", content: "Changes rejected. Script left as it was." },
    ]);
    setProposal(null);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---- Script editor / diff card ---- */}
      <div className="oo-card-static flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
              {locked ? "Suggested changes" : "Your script"}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--oo-text-dim)" }}>
              {locked
                ? "Review the diff, then accept or reject."
                : `${wordCount(body)} words · pillar: ${script.pillar} · angle: ${script.angle}`}
            </p>
          </div>
          {!locked ? (
            <button
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--oo-text-secondary)" }}
              onClick={() => navigator.clipboard.writeText(`${hook}\n\n${body}`)}
            >
              <Copy className="size-3.5" /> Copy
            </button>
          ) : null}
        </div>

        {locked && proposal ? (
          <ProposalDiff
            current={`${hook}\n\n${body}`}
            proposed={`${proposal.hook}\n\n${proposal.body}`}
            summary={proposal.summary}
            onAccept={acceptProposal}
            onReject={rejectProposal}
          />
        ) : (
          <>
            <div>
              <p className="label-xs mb-2">HOOK</p>
              <textarea
                className="oo-input resize-none"
                rows={2}
                value={hook}
                onChange={(e) => setHook(e.target.value)}
              />
            </div>
            <div>
              <p className="label-xs mb-2">BODY</p>
              <textarea
                className="oo-input resize-none font-sans leading-relaxed"
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            {saveError ? (
              <div
                className="rounded-lg p-3 text-sm"
                style={{
                  background: "rgba(192,57,43,0.07)",
                  border: "1px solid rgba(192,57,43,0.3)",
                  color: "var(--oo-bof)",
                }}
              >
                {saveError}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button className="oo-btn-ghost px-5 py-2.5 text-sm" onClick={onBack}>
                &larr; Back
              </button>
              <button
                className="gold-btn flex items-center gap-2 px-6 py-2.5 text-sm disabled:opacity-50"
                onClick={() => onSave(hook, body)}
                disabled={saving || savedId !== null || hook.trim().length === 0 || body.trim().length === 0}
              >
                <CheckCircle className="size-3.5" />
                {savedId ? "Saved" : saving ? "Saving..." : "Save to library"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ---- Chat card ---- */}
      <div className="oo-card-static flex h-[34rem] flex-col p-0">
        <div className="border-b px-6 py-4" style={{ borderColor: "var(--oo-border)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
            Refine with the assistant
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--oo-text-dim)" }}>
            Ask for changes and it will suggest edits you can accept.
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {messages.length === 0 && !sending ? (
            <p className="text-sm" style={{ color: "var(--oo-text-dim)" }}>
              Try: &ldquo;Make the hook punchier&rdquo;, &ldquo;Shorten the close&rdquo;, or
              &ldquo;Why does the middle drag?&rdquo;
            </p>
          ) : null}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {sending ? <TypingIndicator /> : null}
          {chatError ? (
            <p
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgba(192,57,43,0.07)",
                border: "1px solid rgba(192,57,43,0.3)",
                color: "var(--oo-bof)",
              }}
            >
              {chatError}
            </p>
          ) : null}
        </div>

        <div className="border-t px-4 py-3" style={{ borderColor: "var(--oo-border)" }}>
          {locked ? (
            <p className="px-2 py-2 text-xs" style={{ color: "var(--oo-text-dim)" }}>
              Accept or reject the suggested changes to keep chatting.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <textarea
                className="oo-input flex-1 resize-none"
                rows={1}
                placeholder="Ask for a change..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                disabled={sending}
              />
              <button
                className="gold-btn flex size-10 shrink-0 items-center justify-center p-0 disabled:opacity-50"
                onClick={() => void send()}
                disabled={sending || input.trim().length === 0}
                aria-label="Send"
              >
                <Send className="size-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposalDiff({
  current,
  proposed,
  summary,
  onAccept,
  onReject,
}: {
  current: string;
  proposed: string;
  summary: string;
  onAccept: () => void;
  onReject: () => void;
}) {
  const ops = useMemo<DiffOp[]>(() => diffLines(current, proposed), [current, proposed]);

  return (
    <>
      <p className="text-sm" style={{ color: "var(--oo-text-secondary)" }}>
        {summary}
      </p>
      <div
        className="max-h-[22rem] overflow-y-auto rounded-xl p-4 font-sans text-sm leading-relaxed"
        style={{ background: "var(--oo-bg-elevated)", border: "1px solid var(--oo-border)" }}
      >
        {ops.map((op, i) => (
          <DiffLine key={i} op={op} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          className="gold-btn flex items-center gap-2 px-6 py-2.5 text-sm"
          onClick={onAccept}
        >
          <Check className="size-3.5" /> Accept changes
        </button>
        <button
          className="oo-btn-ghost flex items-center gap-2 px-5 py-2.5 text-sm"
          onClick={onReject}
        >
          <X className="size-3.5" /> Reject
        </button>
      </div>
    </>
  );
}

function DiffLine({ op }: { op: DiffOp }) {
  if (op.type === "equal") {
    return (
      <div className="whitespace-pre-wrap" style={{ color: "var(--oo-text-secondary)" }}>
        <span style={{ opacity: 0.4 }}>{"  "}</span>
        {op.text || " "}
      </div>
    );
  }
  const add = op.type === "add";
  return (
    <div
      className="whitespace-pre-wrap rounded px-1"
      style={{
        background: add ? "rgba(22,163,74,0.12)" : "rgba(192,57,43,0.12)",
        color: add ? "#16A34A" : "#C0392B",
      }}
    >
      <span style={{ opacity: 0.7 }}>{add ? "+ " : "- "}</span>
      {op.text || " "}
    </div>
  );
}
