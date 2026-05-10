"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { submitOnboarding, type OnboardingState } from "./actions";

type SwearingLevel = "none" | "light" | "strategic" | "frequent";
type HumorStyle = "self_deprecating" | "dry" | "banter" | "none";
type EnergySignal = "calm_authority" | "high_energy" | "reflective" | "intense";

interface ICPFields {
  pain_points: string[];
  desires: string[];
  thoughts_at_2am: string[];
  internal_battles: string[];
  dreams: string[];
}

interface PositioningFields {
  core_philosophy: string;
  contrarian_belief: string;
  differentiator: string;
}

interface StoryBankFields {
  rock_bottom: string;
  breakthrough: string;
  current_journey: string;
}

interface VoiceSignalsFields {
  signature_phrases: string[];
  swearing_level: SwearingLevel;
  humor_style: HumorStyle;
  energy: EnergySignal;
}

interface WizardData {
  niche: string;
  business_description: string;
  voice_samples: string[];
  what_works: string;
  where_stuck: string;
  goals: string[];
  preferred_topics: string[];
  icp: ICPFields;
  positioning: PositioningFields;
  story_bank: StoryBankFields;
  voice_signals: VoiceSignalsFields;
}

const ICP_SLOTS = 3;

const EMPTY: WizardData = {
  niche: "",
  business_description: "",
  voice_samples: ["", "", ""],
  what_works: "",
  where_stuck: "",
  goals: ["", "", ""],
  preferred_topics: ["", "", ""],
  icp: {
    pain_points: ["", "", ""],
    desires: ["", "", ""],
    thoughts_at_2am: ["", "", ""],
    internal_battles: ["", "", ""],
    dreams: ["", "", ""],
  },
  positioning: { core_philosophy: "", contrarian_belief: "", differentiator: "" },
  story_bank: { rock_bottom: "", breakthrough: "", current_journey: "" },
  voice_signals: {
    signature_phrases: ["", "", ""],
    swearing_level: "light",
    humor_style: "dry",
    energy: "calm_authority",
  },
};

const STEP_LABELS = ["Identity", "Voice", "Audience", "Goals"];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(EMPTY);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<OnboardingState>({});

  function update<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function updateArray(
    key: "voice_samples" | "goals" | "preferred_topics",
    index: number,
    value: string,
  ) {
    setData((d) => {
      const next = [...d[key]];
      next[index] = value;
      return { ...d, [key]: next };
    });
  }

  function updateICP(axis: keyof ICPFields, index: number, value: string) {
    setData((d) => {
      const next = [...d.icp[axis]];
      next[index] = value;
      return { ...d, icp: { ...d.icp, [axis]: next } };
    });
  }

  function updatePositioning(field: keyof PositioningFields, value: string) {
    setData((d) => ({ ...d, positioning: { ...d.positioning, [field]: value } }));
  }

  function updateStoryBank(field: keyof StoryBankFields, value: string) {
    setData((d) => ({ ...d, story_bank: { ...d.story_bank, [field]: value } }));
  }

  function updateVoiceSignal<K extends keyof VoiceSignalsFields>(
    field: K,
    value: VoiceSignalsFields[K],
  ) {
    setData((d) => ({ ...d, voice_signals: { ...d.voice_signals, [field]: value } }));
  }

  function updateSignaturePhrase(index: number, value: string) {
    setData((d) => {
      const next = [...d.voice_signals.signature_phrases];
      next[index] = value;
      return {
        ...d,
        voice_signals: { ...d.voice_signals, signature_phrases: next },
      };
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
    fd.set("what_works", data.what_works);
    fd.set("where_stuck", data.where_stuck);
    fd.set("voice_samples", JSON.stringify(cleanList(data.voice_samples)));
    fd.set("goals", JSON.stringify(cleanList(data.goals)));
    fd.set("preferred_topics", JSON.stringify(cleanList(data.preferred_topics)));

    fd.set("icp", JSON.stringify(cleanICP(data.icp)));
    fd.set("positioning", JSON.stringify(data.positioning));

    const storyBank = cleanStoryBank(data.story_bank);
    if (storyBank) fd.set("story_bank", JSON.stringify(storyBank));

    const signatures = cleanList(data.voice_signals.signature_phrases);
    fd.set(
      "voice_signals",
      JSON.stringify({
        ...(signatures.length > 0 ? { signature_phrases: signatures } : {}),
        swearing_level: data.voice_signals.swearing_level,
        humor_style: data.voice_signals.humor_style,
        energy: data.voice_signals.energy,
      }),
    );

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
      {step === 2 ? (
        <StepAudience
          data={data}
          updateICP={updateICP}
          updatePositioning={updatePositioning}
          updateStoryBank={updateStoryBank}
          updateVoiceSignal={updateVoiceSignal}
          updateSignaturePhrase={updateSignaturePhrase}
        />
      ) : null}
      {step === 3 ? <StepGoals data={data} updateArray={updateArray} /> : null}

      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
          Back
        </Button>
        {step < STEP_LABELS.length - 1 ? (
          <Button onClick={next} disabled={!isStepValid(step, data)}>
            Continue
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending || !isStepValid(3, data)}>
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
          Claude is distilling your answers into a Voice DNA. This usually takes 5 to 15 seconds.
        </p>
      ) : null}
    </div>
  );
}

function cleanList(values: string[]): string[] {
  return values.map((s) => s.trim()).filter(Boolean);
}

function cleanICP(icp: ICPFields): ICPFields {
  return {
    pain_points: cleanList(icp.pain_points),
    desires: cleanList(icp.desires),
    thoughts_at_2am: cleanList(icp.thoughts_at_2am),
    internal_battles: cleanList(icp.internal_battles),
    dreams: cleanList(icp.dreams),
  };
}

function cleanStoryBank(sb: StoryBankFields): StoryBankFields | null {
  const cleaned: StoryBankFields = {
    rock_bottom: sb.rock_bottom.trim(),
    breakthrough: sb.breakthrough.trim(),
    current_journey: sb.current_journey.trim(),
  };
  if (!cleaned.rock_bottom && !cleaned.breakthrough && !cleaned.current_journey) {
    return null;
  }
  return cleaned;
}

function isStepValid(step: number, d: WizardData): boolean {
  if (step === 0) {
    return d.niche.trim().length >= 2 && d.business_description.trim().length >= 10;
  }
  if (step === 1) {
    return (
      d.voice_samples.some((s) => s.trim().length >= 20) &&
      d.what_works.trim().length >= 5 &&
      d.where_stuck.trim().length >= 5
    );
  }
  if (step === 2) {
    const icpAxisCount = (Object.keys(d.icp) as Array<keyof ICPFields>).filter((axis) =>
      d.icp[axis].some((s) => s.trim().length >= 2),
    ).length;
    return (
      icpAxisCount === 5 &&
      d.positioning.core_philosophy.trim().length >= 10 &&
      d.positioning.contrarian_belief.trim().length >= 10 &&
      d.positioning.differentiator.trim().length >= 10
    );
  }
  if (step === 3) {
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
        <h2 className="text-xl font-semibold">Who are you?</h2>
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
          Paste 1 to 3 short samples of your real voice. Captions, posts, DMs. Don&apos;t polish
          them.
        </p>
      </header>
      {data.voice_samples.map((sample, i) => (
        <Field key={i} label={`Voice sample ${i + 1}${i === 0 ? "" : " (optional)"}`}>
          <Textarea
            value={sample}
            onChange={(e) => updateArray("voice_samples", i, e.target.value)}
            placeholder={i === 0 ? "Paste a recent post or caption. At least a couple of sentences." : ""}
            rows={4}
          />
        </Field>
      ))}
      <Field label="What's been working">
        <Textarea
          value={data.what_works}
          onChange={(e) => update("what_works", e.target.value)}
          placeholder="Posts, hooks, formats. Be specific."
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

const ICP_AXES: Array<{
  key: keyof ICPFields;
  label: string;
  hint: string;
  placeholder: string;
}> = [
  {
    key: "pain_points",
    label: "Pain points",
    hint: "What keeps your audience stuck right now?",
    placeholder: "e.g. inconsistent lead flow",
  },
  {
    key: "desires",
    label: "Desires",
    hint: "What does success look like to them?",
    placeholder: "e.g. predictable monthly revenue",
  },
  {
    key: "thoughts_at_2am",
    label: "2am thoughts",
    hint: "What do they think about lying in bed at 2am?",
    placeholder: "e.g. am I actually helping anyone?",
  },
  {
    key: "internal_battles",
    label: "Internal battles",
    hint: "The arguments they have with themselves.",
    placeholder: "e.g. depth vs volume",
  },
  {
    key: "dreams",
    label: "Dreams",
    hint: "The big-picture life beyond business.",
    placeholder: "e.g. stop trading hours for money",
  },
];

const SWEARING_OPTIONS: Array<{ value: SwearingLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "strategic", label: "Strategic" },
  { value: "frequent", label: "Frequent" },
];
const HUMOR_OPTIONS: Array<{ value: HumorStyle; label: string }> = [
  { value: "self_deprecating", label: "Self-deprecating" },
  { value: "dry", label: "Dry" },
  { value: "banter", label: "Banter" },
  { value: "none", label: "None" },
];
const ENERGY_OPTIONS: Array<{ value: EnergySignal; label: string }> = [
  { value: "calm_authority", label: "Calm authority" },
  { value: "high_energy", label: "High energy" },
  { value: "reflective", label: "Reflective" },
  { value: "intense", label: "Intense" },
];

function StepAudience({
  data,
  updateICP,
  updatePositioning,
  updateStoryBank,
  updateVoiceSignal,
  updateSignaturePhrase,
}: {
  data: WizardData;
  updateICP: (axis: keyof ICPFields, i: number, v: string) => void;
  updatePositioning: (f: keyof PositioningFields, v: string) => void;
  updateStoryBank: (f: keyof StoryBankFields, v: string) => void;
  updateVoiceSignal: <K extends keyof VoiceSignalsFields>(f: K, v: VoiceSignalsFields[K]) => void;
  updateSignaturePhrase: (i: number, v: string) => void;
}) {
  return (
    <section className="flex flex-col gap-8">
      <header>
        <h2 className="text-xl font-semibold">Who are you for, and where do you stand?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The more specific you are here, the more your scripts and chat will sound like you, not
          like every other coach.
        </p>
      </header>

      <fieldset className="flex flex-col gap-6">
        <legend className="text-sm font-medium">Audience profile</legend>
        <p className="text-xs text-muted-foreground">
          Top 1 to {ICP_SLOTS} per axis. Rank them; the first slot matters most.
        </p>
        {ICP_AXES.map(({ key, label, hint, placeholder }) => (
          <Field key={key} label={`${label}. ${hint}`}>
            <div className="flex flex-col gap-2">
              {data.icp[key].map((value, i) => (
                <Input
                  key={i}
                  value={value}
                  onChange={(e) => updateICP(key, i, e.target.value)}
                  placeholder={i === 0 ? placeholder : ""}
                />
              ))}
            </div>
          </Field>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="text-sm font-medium">Positioning</legend>
        <Field label="Core philosophy">
          <Textarea
            value={data.positioning.core_philosophy}
            onChange={(e) => updatePositioning("core_philosophy", e.target.value)}
            rows={2}
            placeholder="The one belief that drives everything you do. One sentence."
          />
        </Field>
        <Field label="Contrarian belief">
          <Textarea
            value={data.positioning.contrarian_belief}
            onChange={(e) => updatePositioning("contrarian_belief", e.target.value)}
            rows={2}
            placeholder="A widely held belief in your industry that you think is wrong."
          />
        </Field>
        <Field label="Differentiator">
          <Textarea
            value={data.positioning.differentiator}
            onChange={(e) => updatePositioning("differentiator", e.target.value)}
            rows={2}
            placeholder="What separates you from every other person in your niche?"
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="text-sm font-medium">Story bank seed (optional)</legend>
        <p className="text-xs text-muted-foreground">
          Three seed moments. Skip any you do not have to hand. You can grow the bank later.
        </p>
        <Field label="Rock bottom moment">
          <Textarea
            value={data.story_bank.rock_bottom}
            onChange={(e) => updateStoryBank("rock_bottom", e.target.value)}
            rows={2}
            placeholder="A specific moment when things were as bad as they got. Date, place, feeling."
          />
        </Field>
        <Field label="Breakthrough moment">
          <Textarea
            value={data.story_bank.breakthrough}
            onChange={(e) => updateStoryBank("breakthrough", e.target.value)}
            rows={2}
            placeholder="The shift moment. What changed and why."
          />
        </Field>
        <Field label="Current journey">
          <Textarea
            value={data.story_bank.current_journey}
            onChange={(e) => updateStoryBank("current_journey", e.target.value)}
            rows={2}
            placeholder="What you are chasing or building right now that the audience can follow along."
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-6">
        <legend className="text-sm font-medium">Voice signals</legend>
        <Field label="Signature phrases (optional)">
          <div className="flex flex-col gap-2">
            {data.voice_signals.signature_phrases.map((value, i) => (
              <Input
                key={i}
                value={value}
                onChange={(e) => updateSignaturePhrase(i, e.target.value)}
                placeholder={i === 0 ? "Phrases or slang you actually use" : ""}
              />
            ))}
          </div>
        </Field>
        <SelectField
          label="Swearing level"
          value={data.voice_signals.swearing_level}
          options={SWEARING_OPTIONS}
          onChange={(v) => updateVoiceSignal("swearing_level", v)}
        />
        <SelectField
          label="Humor style"
          value={data.voice_signals.humor_style}
          options={HUMOR_OPTIONS}
          onChange={(v) => updateVoiceSignal("humor_style", v)}
        />
        <SelectField
          label="Energy"
          value={data.voice_signals.energy}
          options={ENERGY_OPTIONS}
          onChange={(v) => updateVoiceSignal("energy", v)}
        />
      </fieldset>
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

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
