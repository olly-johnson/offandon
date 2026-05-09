"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { submitOnboarding, type OnboardingState } from "./actions";

interface WizardData {
  niche: string;
  business_description: string;
  target_audience: string;
  voice_samples: string[];
  what_works: string;
  where_stuck: string;
  goals: string[];
  preferred_topics: string[];
}

const EMPTY: WizardData = {
  niche: "",
  business_description: "",
  target_audience: "",
  voice_samples: ["", "", ""],
  what_works: "",
  where_stuck: "",
  goals: ["", "", ""],
  preferred_topics: ["", "", ""],
};

const STEP_LABELS = ["Identity", "Voice", "Goals"];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(EMPTY);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<OnboardingState>({});

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function updateArray(key: "voice_samples" | "goals" | "preferred_topics", index: number, value: string) {
    setData((d) => {
      const next = [...d[key]];
      next[index] = value;
      return { ...d, [key]: next };
    });
  }

  function next() {
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setPending(true);
    const fd = new FormData();
    fd.set("niche", data.niche);
    fd.set("business_description", data.business_description);
    fd.set("target_audience", data.target_audience);
    fd.set("what_works", data.what_works);
    fd.set("where_stuck", data.where_stuck);
    fd.set("voice_samples", JSON.stringify(data.voice_samples.map((s) => s.trim()).filter(Boolean)));
    fd.set("goals", JSON.stringify(data.goals.map((s) => s.trim()).filter(Boolean)));
    fd.set("preferred_topics", JSON.stringify(data.preferred_topics.map((s) => s.trim()).filter(Boolean)));
    const result = await submitOnboarding({}, fd);
    if (result?.error) {
      setState(result);
      setPending(false);
    }
    // On success the action redirects, so we never re-enable here.
  }

  return (
    <div className="flex flex-col gap-8">
      <Progress current={step} labels={STEP_LABELS} />

      {step === 0 ? <StepIdentity data={data} update={update} /> : null}
      {step === 1 ? <StepVoice data={data} update={update} updateArray={updateArray} /> : null}
      {step === 2 ? <StepGoals data={data} updateArray={updateArray} /> : null}

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
          Back
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button onClick={next} disabled={!isStepValid(step, data)}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending || !isStepValid(2, data)}>
            {pending ? "Generating Voice DNA…" : "Generate Voice DNA"}
          </Button>
        )}
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      {pending ? (
        <p className="text-xs text-muted-foreground">
          Claude is distilling your answers into a Voice DNA. This usually takes 5–15 seconds.
        </p>
      ) : null}
    </div>
  );
}

function isStepValid(step: number, d: WizardData): boolean {
  if (step === 0) {
    return (
      d.niche.trim().length >= 2 &&
      d.business_description.trim().length >= 10 &&
      d.target_audience.trim().length >= 5
    );
  }
  if (step === 1) {
    return (
      d.voice_samples.some((s) => s.trim().length >= 20) &&
      d.what_works.trim().length >= 5 &&
      d.where_stuck.trim().length >= 5
    );
  }
  if (step === 2) {
    return d.goals.some((s) => s.trim().length >= 2);
  }
  return false;
}

function Progress({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2 text-xs uppercase tracking-wide">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2">
          <span
            className={[
              "flex size-6 items-center justify-center rounded-full border",
              i === current
                ? "border-primary bg-primary text-primary-foreground"
                : i < current
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground",
            ].join(" ")}
          >
            {i + 1}
          </span>
          <span className={i === current ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          {i < labels.length - 1 ? <span className="mx-1 text-muted-foreground">›</span> : null}
        </li>
      ))}
    </ol>
  );
}

function StepIdentity({
  data,
  update,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold">Who are you for?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bot OS uses these answers as the spine of every script and chat reply.
        </p>
      </header>
      <Field label="Your niche">
        <Input
          value={data.niche}
          onChange={(e) => update("niche", e.target.value)}
          placeholder="e.g. fitness coaches, B2B SaaS founders"
        />
      </Field>
      <Field label="Your business in one paragraph">
        <Textarea
          value={data.business_description}
          onChange={(e) => update("business_description", e.target.value)}
          placeholder="What you do, who you sell to, what makes you different."
          rows={4}
        />
      </Field>
      <Field label="Your target audience">
        <Textarea
          value={data.target_audience}
          onChange={(e) => update("target_audience", e.target.value)}
          placeholder="The specific person you want to attract — role, stage, what they care about."
          rows={3}
        />
      </Field>
    </section>
  );
}

function StepVoice({
  data,
  update,
  updateArray,
}: {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  updateArray: (k: "voice_samples" | "goals" | "preferred_topics", i: number, v: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold">How do you sound?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste 1–3 short samples of your real voice — captions, posts, DMs. Don&apos;t polish them.
        </p>
      </header>
      {data.voice_samples.map((sample, i) => (
        <Field key={i} label={`Voice sample ${i + 1}${i === 0 ? "" : " (optional)"}`}>
          <Textarea
            value={sample}
            onChange={(e) => updateArray("voice_samples", i, e.target.value)}
            placeholder={i === 0 ? "Paste a recent post or caption — at least a couple of sentences." : ""}
            rows={4}
          />
        </Field>
      ))}
      <Field label="What's been working">
        <Textarea
          value={data.what_works}
          onChange={(e) => update("what_works", e.target.value)}
          placeholder="Posts, hooks, formats — be specific."
          rows={3}
        />
      </Field>
      <Field label="Where you're stuck">
        <Textarea
          value={data.where_stuck}
          onChange={(e) => update("where_stuck", e.target.value)}
          placeholder="What isn't landing? Where do you run out of ideas?"
          rows={3}
        />
      </Field>
    </section>
  );
}

function StepGoals({
  data,
  updateArray,
}: {
  data: WizardData;
  updateArray: (k: "voice_samples" | "goals" | "preferred_topics", i: number, v: string) => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold">What are you here to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Concrete outcomes. Followers is fine; revenue is better.
        </p>
      </header>
      {data.goals.map((goal, i) => (
        <Field key={i} label={`Goal ${i + 1}${i === 0 ? "" : " (optional)"}`}>
          <Input
            value={goal}
            onChange={(e) => updateArray("goals", i, e.target.value)}
            placeholder={i === 0 ? "e.g. 5K MRR from coaching clients in 90 days" : ""}
          />
        </Field>
      ))}
      <Field label="Topics you want to own (optional)">
        <div className="flex flex-col gap-2">
          {data.preferred_topics.map((topic, i) => (
            <Input
              key={i}
              value={topic}
              onChange={(e) => updateArray("preferred_topics", i, e.target.value)}
              placeholder={`Topic ${i + 1}`}
            />
          ))}
        </div>
      </Field>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
