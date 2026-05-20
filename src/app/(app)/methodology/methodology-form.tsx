"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { saveMethodologyAction, type SaveMethodologyState } from "./actions";

const MAX_ADDITION_CHARS = 2000;

export function MethodologyForm() {
  const [content, setContent] = useState("");
  const [state, formAction, pending] = useActionState<
    SaveMethodologyState,
    FormData
  >(async (prev, fd) => {
    const next = await saveMethodologyAction(prev, fd);
    if (next.saved) setContent("");
    return next;
  }, {});

  const overLimit = content.length > MAX_ADDITION_CHARS;
  const showSaved = !pending && state.saved === true && content === "";
  const trimmed = content.trim();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="content"
        rows={8}
        placeholder="Add a new rule, e.g. 'Never use the word unlock.'"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="oo-input resize-y font-mono text-sm leading-relaxed"
        style={{ minHeight: "180px" }}
      />

      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs"
          style={{
            color: overLimit ? "var(--oo-bof)" : "var(--oo-text-dim)",
          }}
        >
          {content.length.toLocaleString()} / {MAX_ADDITION_CHARS.toLocaleString()} chars
        </p>
        <div className="flex items-center gap-3">
          {showSaved ? (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--oo-tof)" }}
            >
              <Check className="size-3.5" />
              Added
            </span>
          ) : null}
          <button
            type="submit"
            disabled={pending || overLimit || trimmed.length === 0}
            className="gold-btn flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="oo-spin size-3.5" />
                Adding...
              </>
            ) : (
              "Add rule"
            )}
          </button>
        </div>
      </div>

      {state.error ? (
        <p className="text-xs" role="alert" style={{ color: "var(--oo-bof)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
