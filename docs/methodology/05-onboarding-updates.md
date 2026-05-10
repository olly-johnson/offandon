# Onboarding Update Proposal

The current onboarding (Voice DNA questionnaire) captures niche, business description, goals, voice samples, what works, where stuck, target audience, preferred topics, banned phrases. That's enough for Voice DNA but **under-feeds** the methodology in three places:

1. The audience-persona it produces is shallow: `pain_points`, `aspirations`, `language_register` only. The methodology asks for **2am thoughts**, **internal battles**, and **dreams** as separate axes (the strategy template's expansion).
2. The story bank is empty. The Script Writer needs **named, dated stories** to draw from for Hero's Journey / Man in a Hole / Challenge to Victory pieces. Without them it either fabricates (banned) or stays generic (weak).
3. The creator's **contrarian belief** / core philosophy is not captured. Without it the model defaults to safe centrist takes that don't filter the right audience.

## Proposed new fields (additive; keep all existing fields)

### 1. ICP expansion (replaces the current single `target_audience` string)

Each as a free-text field that accepts a ranked list (top 3 minimum, top 6 ideal):

| Field | Prompt the creator sees |
|---|---|
| `icp_pain_points` | What keeps your ICP stuck right now? |
| `icp_desires` | What do they dream about / what does success look like? |
| `icp_2am_thoughts` | What do they think about lying in bed at 2am? |
| `icp_internal_battles` | The war inside their head. What are they arguing with themselves about? |
| `icp_dreams` | The big-picture life they want, beyond business. |

Why split: each axis powers a different content angle. Pain points → Common Mistake / Myth Busting. 2am thoughts → Mirror Thinking lines. Internal battles → Big Goal / About Me. Dreams → BOF Selling pieces.

### 2. Story bank (new field, optional but strongly prompted)

Three sub-fields. Each accepts a 1–2 sentence summary; the creator can flesh them out later in `/settings/story-bank`.

| Field | Prompt |
|---|---|
| `rock_bottom` | A specific moment when things were as bad as they got. Date, place, what you felt. |
| `breakthrough` | The shift moment. What changed and why. |
| `current_journey` | What you're chasing or building right now that the audience can follow along. |

Why: these are the seed material for Hero's Journey, Man in a Hole, Big Goal/Dream, and About Me structures. Without seeds, the Script Writer either fabricates or stays generic.

### 3. Positioning (new fields)

| Field | Prompt |
|---|---|
| `core_philosophy` | The one belief that drives everything you do. One sentence. |
| `contrarian_belief` | A widely-held belief in your industry that you think is wrong. |
| `differentiator` | What separates you from every other person in your niche? |

Why: the SCCCC hook framework relies on Contrast and Clarity. Both fail without a defined contrarian position.

### 4. Voice signals (new fields)

| Field | Prompt |
|---|---|
| `signature_phrases` | Phrases or slang you actually use that should appear in your content. |
| `swearing_level` | none / light / strategic / frequent |
| `humor_style` | self-deprecating / dry / banter / none |
| `energy` | calm authority / high energy / reflective / intense |

Why: the existing `tone_profile.descriptors` is too coarse. These four are the dials the methodology actually pulls when shaping a hook's energy or a script's register.

### 5. Inspiration set (new field, optional)

| Field | Prompt |
|---|---|
| `example_creators` | 3–5 creators you admire OR compete with. Name + platform + one line on why. |

Why: feeds the future analyst surface (competitor gap analysis) and gives the chat surface a concrete reference frame when the creator says "I want my content to feel more like X."

## What to drop / merge

- `preferred_topics` → keep, but rename it conceptually as `pillar_seeds`. The Voice Engine already turns this into `content_pillars`. The label is fine.
- `where_stuck` → keep. The chat surface uses it as a blocker map.

## UI implications

- Onboarding wizard goes from 3 steps to 4 (add a "Story bank + positioning" step). Story bank fields are optional; positioning fields are required.
- Add a `/settings/story-bank` page so the creator can grow it over time. Each saved chat where they tell a story should auto-suggest adding it (overlap with BO-034 user memory).
- Add `/settings/icp` and `/settings/voice-signals` editors so they can refine without re-running the full questionnaire.

## Cost

- Voice DNA prompt grows by maybe 200–300 tokens (the new ICP and positioning fields). Cached, so the cost is one-time per generation.
- Database: extend `voice_dna.source_answers` schema (jsonb, additive, no migration needed) and `OnboardingAnswers` TypeScript type.
- Onboarding form: ~6 new inputs. One additional wizard step.

## Tracking

Track as BO-038 in `docs/TASK_BOARD.md` once the methodology PR lands.
