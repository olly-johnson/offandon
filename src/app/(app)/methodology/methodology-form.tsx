"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { saveMethodologyAction, type SaveMethodologyState } from "./actions";

interface MethodologyFormProps {
  initialContent: string;
}

const MAX_OVERLAY_CHARS = 8000;

export function MethodologyForm({ initialContent }: MethodologyFormProps) {
  // After a successful save the server revalidates and re-renders the page,
  // so initialContent reflects the freshly-persisted value. Tracking the
  // user's "last saved snapshot" locally lets us show a quiet "Saved" badge
  // until they start editing again, without needing a timer effect.
  const [lastSaved, setLastSaved] = useState(initialContent);
  const [content, setContent] = useState(initialContent);
  const [state, formAction, pending] = useActionState<
    SaveMethodologyState,
    FormData
  >(async (prev, fd) => {
    const next = await saveMethodologyAction(prev, fd);
    if (next.saved) setLastSaved((fd.get("content") ?? "").toString());
    return next;
  }, {});

  const overLimit = content.length > MAX_OVERLAY_CHARS;
  const dirty = content !== initialContent;
  const showSaved = !pending && state.saved === true && content === lastSaved;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <textarea
        name="content"
        rows={14}
        placeholder="Write your personal rules here, one per line..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="oo-input resize-y font-mono text-sm leading-relaxed"
        style={{ minHeight: "320px" }}
      />

      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs"
          style={{
            color: overLimit ? "var(--oo-bof)" : "var(--oo-text-dim)",
          }}
        >
          {content.length.toLocaleString()} / {MAX_OVERLAY_CHARS.toLocaleString()} chars
        </p>
        <div className="flex items-center gap-3">
          {showSaved ? (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--oo-tof)" }}
            >
              <Check className="size-3.5" />
              Saved
            </span>
          ) : null}
          <button
            type="submit"
            disabled={pending || overLimit || !dirty}
            className="gold-btn flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="oo-spin size-3.5" />
                Saving...
              </>
            ) : (
              "Save methodology"
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
