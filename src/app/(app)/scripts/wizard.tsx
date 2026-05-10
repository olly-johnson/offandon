"use client";

import { useState } from "react";
import { CheckCircle, Copy, Loader2, RefreshCw } from "lucide-react";

import {
  extractIMFAction,
  generateHooksAction,
  generateSingleScriptAction,
  saveScriptToLibraryAction,
} from "./actions";
import type {
  GeneratedHook,
  GeneratedHookBatch,
  GeneratedSingleScript,
  HookScore,
  HookType,
  IMF,
} from "@/engines/content/types";

const STEP_LABELS = ["Concept", "IMF", "Hooks", "Script", "Refine"] as const;

const TYPE_STYLES: Record<HookType, { bg: string; color: string }> = {
  STORYTELLING: { bg: "rgba(29,78,216,0.10)", color: "#1D4ED8" },
  CONFRONTATIONAL: { bg: "rgba(192,57,43,0.10)", color: "#C0392B" },
  VULNERABILITY: { bg: "rgba(109,40,217,0.10)", color: "#6D28D9" },
  CURIOSITY: { bg: "rgba(180,83,9,0.10)", color: "#B45309" },
  PROOF: { bg: "rgba(22,163,74,0.10)", color: "#16A34A" },
  EDUCATIONAL: { bg: "rgba(2,132,199,0.10)", color: "#0284C7" },
};

function totalPct(s: HookScore): number {
  return Math.round(
    ((s.curiosity + s.specificity + s.voice_match + s.brevity + s.identity_alignment) / 5) * 100,
  );
}

export function ScriptWizard({ onSaved }: { onSaved?: (id: string) => void }) {
  const [step, setStep] = useState(1);
  const [concept, setConcept] = useState("");
  const [imf, setImf] = useState<IMF>({ idea: "", message: "", feel: "" });
  const [imfLoading, setImfLoading] = useState(false);
  const [imfError, setImfError] = useState("");
  const [imfHydrated, setImfHydrated] = useState(false);

  const [hookBatch, setHookBatch] = useState<GeneratedHookBatch | null>(null);
  const [hookIdx, setHookIdx] = useState<number | null>(null);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksError, setHooksError] = useState("");

  const [script, setScript] = useState<GeneratedSingleScript | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [refinement, setRefinement] = useState("");

  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function autoExtractIMF(force = false) {
    if (!concept.trim() || concept.trim().length < 8) return;
    if (!force && (imf.idea || imf.message || imf.feel)) return;
    setImfLoading(true);
    setImfError("");
    const res = await extractIMFAction(concept);
    setImfLoading(false);
    if ("error" in res) {
      setImfError(res.error);
      return;
    }
    setImf(res.imf);
    setImfHydrated(true);
  }

  async function generateHooks() {
    setHookIdx(null);
    setHookBatch(null);
    setHooksError("");
    setHooksLoading(true);
    setStep(3);
    const res = await generateHooksAction({ concept, imf, count: 6 });
    setHooksLoading(false);
    if ("error" in res) {
      setHooksError(res.error);
      return;
    }
    setHookBatch(res.batch);
    setHookIdx(res.batch.suggested_index);
  }

  async function generateScript(extraRefinement?: string) {
    if (hookIdx === null || !hookBatch) return;
    const hook = hookBatch.hooks[hookIdx];
    if (!hook) return;
    setScript(null);
    setScriptError("");
    setScriptLoading(true);
    setStep(4);
    const res = await generateSingleScriptAction({
      concept,
      imf,
      hook: hook.text,
      refinement: extraRefinement || undefined,
    });
    setScriptLoading(false);
    if ("error" in res) {
      setScriptError(res.error);
      return;
    }
    setScript(res.script);
  }

  async function save() {
    if (!script) return;
    setSaving(true);
    setSaveError("");
    const res = await saveScriptToLibraryAction({
      hook: script.hook,
      body: script.body,
    });
    setSaving(false);
    if ("error" in res) {
      setSaveError(res.error);
      return;
    }
    setSavedId(res.id);
    onSaved?.(res.id);
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {step === 1 ? (
        <Step1Concept
          concept={concept}
          setConcept={setConcept}
          onContinue={() => {
            if (concept.trim().length >= 8) {
              // Set both states synchronously so React batches them and
              // Step 2 paints with loading=true on its first render.
              setImfLoading(true);
              setImfError("");
              setStep(2);
              autoExtractIMF();
            }
          }}
        />
      ) : null}

      {step === 2 ? (
        <Step2IMF
          imf={imf}
          setImf={setImf}
          loading={imfLoading}
          error={imfError}
          hydrated={imfHydrated}
          onReExtract={() => autoExtractIMF(true)}
          onBack={() => setStep(1)}
          onContinue={generateHooks}
        />
      ) : null}

      {step === 3 ? (
        <Step3Hooks
          batch={hookBatch}
          loading={hooksLoading}
          error={hooksError}
          selected={hookIdx}
          onSelect={(i) => setHookIdx(i)}
          onRegenerate={generateHooks}
          onBack={() => setStep(2)}
          onContinue={() => generateScript()}
        />
      ) : null}

      {step === 4 ? (
        <Step4Script
          script={script}
          loading={scriptLoading}
          error={scriptError}
          onBack={() => setStep(3)}
          onContinue={() => setStep(5)}
        />
      ) : null}

      {step === 5 ? (
        <Step5Refine
          refinement={refinement}
          setRefinement={setRefinement}
          script={script}
          loading={scriptLoading}
          saving={saving}
          savedId={savedId}
          saveError={saveError}
          onBack={() => setStep(4)}
          onRegenerate={() => {
            if (refinement.trim().length > 0) {
              const r = refinement;
              setRefinement("");
              generateScript(r);
            }
          }}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center gap-1.5 overflow-x-auto pb-1">
      {STEP_LABELS.map((s, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <div key={s} className="flex shrink-0 items-center gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className="flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-all"
                style={{
                  borderColor: done || active ? "var(--oo-gold)" : "var(--oo-border)",
                  background: done
                    ? "var(--oo-gold)"
                    : active
                      ? "var(--oo-gold-dim)"
                      : "transparent",
                  color: done ? "#fff" : active ? "var(--oo-gold)" : "var(--oo-text-dim)",
                }}
              >
                {done ? <CheckCircle className="size-3.5" /> : n}
              </div>
              <span
                className="text-sm"
                style={{
                  color: active
                    ? "var(--oo-text-primary)"
                    : done
                      ? "var(--oo-gold)"
                      : "var(--oo-text-dim)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {s}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 ? (
              <div
                className="h-px w-5"
                style={{
                  background: step > n ? "var(--oo-gold)" : "var(--oo-border)",
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Step1Concept({
  concept,
  setConcept,
  onContinue,
}: {
  concept: string;
  setConcept: (v: string) => void;
  onContinue: () => void;
}) {
  const tooShort = concept.trim().length < 8;
  return (
    <div className="oo-card-static max-w-2xl space-y-4 p-6">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
          What&apos;s your video about?
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--oo-text-secondary)" }}>
          The more specific, the stronger the script.
        </p>
      </div>
      <textarea
        className="oo-input resize-none"
        rows={5}
        placeholder="e.g. The moment I realised I was undercharging every client..."
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
      />
      <button
        className="gold-btn px-6 py-2.5 text-sm disabled:opacity-50"
        disabled={tooShort}
        onClick={onContinue}
      >
        Continue &rarr;
      </button>
    </div>
  );
}

function Step2IMF({
  imf,
  setImf,
  loading,
  error,
  hydrated,
  onReExtract,
  onBack,
  onContinue,
}: {
  imf: IMF;
  setImf: (v: IMF) => void;
  loading: boolean;
  error: string;
  hydrated: boolean;
  onReExtract: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const fields = [
    {
      label: "IDEA",
      value: imf.idea,
      set: (v: string) => setImf({ ...imf, idea: v }),
      ph: "One sentence. What is this video specifically about?",
    },
    {
      label: "MESSAGE",
      value: imf.message,
      set: (v: string) => setImf({ ...imf, message: v }),
      ph: "What should the viewer walk away understanding?",
    },
    {
      label: "FEEL",
      value: imf.feel,
      set: (v: string) => setImf({ ...imf, feel: v }),
      ph: "How should they feel about you after watching?",
    },
  ];

  return (
    <div className="oo-card-static max-w-2xl space-y-5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
            Message Lock (IMF)
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--oo-text-secondary)" }}>
            {loading
              ? "Drafting from your concept..."
              : hydrated
                ? "Drafted from your concept. Edit anything that's off."
                : "Three locked inputs the script writer needs before it can start."}
          </p>
        </div>
        {!loading ? (
          <button
            className="oo-btn-ghost flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs"
            onClick={onReExtract}
          >
            <RefreshCw className="size-3.5" /> Re-extract
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: "rgba(192,57,43,0.07)",
            border: "1px solid rgba(192,57,43,0.3)",
            color: "var(--oo-bof)",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          className="flex flex-col items-center gap-3 rounded-xl px-6 py-10"
          style={{
            background: "var(--oo-gold-dim)",
            border: "1px solid var(--oo-border-gold)",
          }}
        >
          <Loader2
            className="oo-spin size-6"
            style={{ color: "var(--oo-gold)" }}
          />
          <p className="text-sm font-medium" style={{ color: "var(--oo-gold)" }}>
            Drafting IDEA, MESSAGE, and FEEL from your concept...
          </p>
          <p className="text-xs" style={{ color: "var(--oo-text-secondary)" }}>
            Usually 5 to 10 seconds.
          </p>
        </div>
      ) : (
        fields.map(({ label, value, set, ph }) => (
          <div key={label}>
            <p className="label-xs mb-2">{label}</p>
            <input
              className="oo-input"
              placeholder={ph}
              value={value}
              onChange={(e) => set(e.target.value)}
            />
          </div>
        ))
      )}

      <div className="flex gap-3">
        <button className="oo-btn-ghost px-5 py-2.5 text-sm" onClick={onBack}>
          &larr; Back
        </button>
        <button
          className="gold-btn px-6 py-2.5 text-sm disabled:opacity-50"
          onClick={onContinue}
          disabled={loading}
        >
          Generate Hooks &rarr;
        </button>
      </div>
    </div>
  );
}

function Step3Hooks({
  batch,
  loading,
  error,
  selected,
  onSelect,
  onRegenerate,
  onBack,
  onContinue,
}: {
  batch: GeneratedHookBatch | null;
  loading: boolean;
  error: string;
  selected: number | null;
  onSelect: (i: number) => void;
  onRegenerate: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="oo-card-static max-w-3xl space-y-5 p-6">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
          Choose your hook
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--oo-text-dim)" }}>
          {batch
            ? `${batch.hooks.length} hooks scored. Pick one or stick with the suggested.`
            : loading
              ? "Generating..."
              : ""}
        </p>
      </div>

      {error ? (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: "rgba(192,57,43,0.07)",
            border: "1px solid rgba(192,57,43,0.3)",
            color: "var(--oo-bof)",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--oo-text-dim)" }}>
          Generating hooks...
        </p>
      ) : batch ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {batch.hooks.map((h, i) => (
            <HookCard
              key={i}
              hook={h}
              selected={selected === i}
              suggested={batch.suggested_index === i}
              onClick={() => onSelect(i)}
            />
          ))}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button className="oo-btn-ghost px-5 py-2.5 text-sm" onClick={onBack}>
          &larr; Back
        </button>
        <button
          className="oo-btn-ghost flex items-center gap-2 px-5 py-2.5 text-sm"
          onClick={onRegenerate}
        >
          <RefreshCw className="size-3.5" /> Regenerate
        </button>
        <button
          className="gold-btn px-6 py-2.5 text-sm disabled:opacity-50"
          onClick={onContinue}
          disabled={selected === null || loading}
        >
          Generate Script &rarr;
        </button>
      </div>
    </div>
  );
}

function HookCard({
  hook,
  selected,
  suggested,
  onClick,
}: {
  hook: GeneratedHook;
  selected: boolean;
  suggested: boolean;
  onClick: () => void;
}) {
  const ts = TYPE_STYLES[hook.type] ?? {
    bg: "var(--oo-bg-hover)",
    color: "var(--oo-text-secondary)",
  };
  const pct = totalPct(hook.score);

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer rounded-xl p-4 transition-all"
      style={{
        background: selected ? "var(--oo-gold-dim)" : "var(--oo-bg-elevated)",
        border: selected ? "1px solid var(--oo-border-gold)" : "1px solid var(--oo-border)",
        boxShadow: selected ? "var(--oo-card-shadow-hover)" : "none",
      }}
    >
      {suggested ? (
        <span
          className="absolute -top-2 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: "var(--oo-gold)", color: "#fff" }}
        >
          SUGGESTED
        </span>
      ) : null}
      <p
        className="mb-3 text-sm font-medium leading-snug"
        style={{ color: "var(--oo-text-primary)" }}
      >
        &ldquo;{hook.text}&rdquo;
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold"
          style={{ background: ts.bg, color: ts.color }}
        >
          {hook.type}
        </span>
        <span
          className="ml-auto text-xs font-bold"
          style={{ color: "var(--oo-gold)" }}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1">
        {(
          [
            ["Curiosity", hook.score.curiosity],
            ["Specific", hook.score.specificity],
            ["Voice", hook.score.voice_match],
            ["Brevity", hook.score.brevity],
            ["Identity", hook.score.identity_alignment],
          ] as const
        ).map(([label, val]) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1"
            title={`${label}: ${Math.round(val * 100)}%`}
          >
            <div
              className="h-1 w-full overflow-hidden rounded-full"
              style={{ background: "var(--oo-border)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.round(val * 100)}%`,
                  background:
                    val >= 0.7
                      ? "var(--oo-gold)"
                      : val >= 0.4
                        ? "rgba(180,83,9,0.6)"
                        : "rgba(192,57,43,0.5)",
                }}
              />
            </div>
            <span className="text-[9px]" style={{ color: "var(--oo-text-dim)" }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step4Script({
  script,
  loading,
  error,
  onBack,
  onContinue,
}: {
  script: GeneratedSingleScript | null;
  loading: boolean;
  error: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="oo-card-static max-w-2xl space-y-5 p-6">
      {loading ? (
        <p className="text-sm" style={{ color: "var(--oo-text-dim)" }}>
          Generating script...
        </p>
      ) : error ? (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: "rgba(192,57,43,0.07)",
            border: "1px solid rgba(192,57,43,0.3)",
            color: "var(--oo-bof)",
          }}
        >
          {error}
        </div>
      ) : script ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2
                className="text-base font-bold"
                style={{ color: "var(--oo-text-primary)" }}
              >
                Your script
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--oo-text-dim)" }}>
                {script.word_count} words · pillar: {script.pillar} · angle: {script.angle}
              </p>
            </div>
            <button
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--oo-text-secondary)" }}
              onClick={() => navigator.clipboard.writeText(`${script.hook}\n\n${script.body}`)}
            >
              <Copy className="size-3.5" /> Copy
            </button>
          </div>
          <div
            className="rounded-xl p-5 text-sm leading-relaxed"
            style={{
              background: "var(--oo-bg-elevated)",
              border: "1px solid var(--oo-border)",
            }}
          >
            <p
              className="mb-4 font-semibold"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {script.hook}
            </p>
            <pre
              className="whitespace-pre-wrap font-sans text-sm leading-relaxed"
              style={{ color: "var(--oo-text-primary)" }}
            >
              {script.body}
            </pre>
          </div>
        </>
      ) : null}

      <div className="flex gap-3">
        <button className="oo-btn-ghost px-5 py-2.5 text-sm" onClick={onBack}>
          &larr; Back
        </button>
        <button
          className="gold-btn px-6 py-2.5 text-sm disabled:opacity-50"
          onClick={onContinue}
          disabled={loading || !script}
        >
          Refine &rarr;
        </button>
      </div>
    </div>
  );
}

function Step5Refine({
  refinement,
  setRefinement,
  script,
  loading,
  saving,
  savedId,
  saveError,
  onBack,
  onRegenerate,
  onSave,
}: {
  refinement: string;
  setRefinement: (v: string) => void;
  script: GeneratedSingleScript | null;
  loading: boolean;
  saving: boolean;
  savedId: string | null;
  saveError: string;
  onBack: () => void;
  onRegenerate: () => void;
  onSave: () => void;
}) {
  return (
    <div className="oo-card-static max-w-2xl space-y-5 p-6">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--oo-text-primary)" }}>
          Refine your script
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--oo-text-secondary)" }}>
          What doesn&apos;t sound right? What would you change? Leave blank to save as is.
        </p>
      </div>

      <textarea
        className="oo-input resize-none"
        rows={4}
        placeholder="e.g. The second paragraph feels too formal."
        value={refinement}
        onChange={(e) => setRefinement(e.target.value)}
      />

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
          className="oo-btn-ghost flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50"
          onClick={onRegenerate}
          disabled={loading || refinement.trim().length === 0}
        >
          <RefreshCw className="size-3.5" /> {loading ? "Regenerating..." : "Regenerate"}
        </button>
        <button
          className="gold-btn flex items-center gap-2 px-6 py-2.5 text-sm disabled:opacity-50"
          onClick={onSave}
          disabled={saving || !script || savedId !== null}
        >
          <CheckCircle className="size-3.5" />
          {savedId ? "Saved" : saving ? "Saving..." : "Save to library"}
        </button>
      </div>
    </div>
  );
}
