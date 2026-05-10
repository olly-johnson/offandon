# Bot OS Methodology — Overview

Source: distilled from `/examples/` (Alex / ABS Method, Frederick Behus YouTube, etc.). The originals are agency-specific. The extraction below is **generic**: any creator using Bot OS gets it.

## Layering

The methodology is layered so each surface (chat, scripts, analyst, future) loads only what it needs. Anything unused is bloat — every token in a system prompt costs latency, money, and attention.

```
┌──────────────────────────────────────────────────────────────────┐
│ Layer 1: HOUSE METHODOLOGY (loaded by every LLM-using surface)   │
│  - Trust Equation, Trust Funnel, "show don't tell", specificity, │
│    anti-guru positioning, conversational voice, Connection Points│
│    (named only). 01-house.md — keep under ~700 tokens.           │
├──────────────────────────────────────────────────────────────────┤
│ Layer 2: SURFACE SLICE (one of: chat / scripts / analyst / ...)  │
│  - Just the parts of the methodology this surface needs to ACT.  │
│  - 02-chat.md, 03-scripts.md, 04-analyst.md.                     │
├──────────────────────────────────────────────────────────────────┤
│ Layer 3: PER-USER VOICE DNA (already built — VoiceDNA)           │
│  - tone, pillars, persona, prohibited phrases.                   │
├──────────────────────────────────────────────────────────────────┤
│ Layer 4: PER-USER METHODOLOGY OVERLAY (future, optional)         │
│  - Creator's own evergreen rules (BO-036). Edited in /settings.  │
└──────────────────────────────────────────────────────────────────┘
```

**Voice reference rule (every layer):** Layers 1–4 must each defer to the creator's Voice DNA when there is conflict between a generic principle and the creator's voice. The methodology says "speak with absolute conviction"; the creator's tone says "warm-mentor". Conviction wins on the *what*, warmth wins on the *how*.

## Principles for keeping prompts lean

1. **Name, don't define.** The chat surface needs to KNOW the storytelling structures exist by name (`Hero's Journey`, `Man in a Hole`). The script writer is the one that needs the section-by-section breakdowns. Never duplicate.
2. **One source of truth.** The house layer is the only place a principle is fully written out. Surface slices reference it by name (`See house: Connection Points`).
3. **Numbers > prose.** "3-5 contrast words per script" beats "use plenty of contrast words".
4. **Cut everything that doesn't change the output.** If a sentence in the prompt could be removed and the model would produce the same thing, remove it.
5. **No prose bloat in checklists.** Binary items only.

## Loading mechanism

Same `extractSection` pattern we use for the Humanization Manifesto. Each surface's `system-prompt.ts` reads its slice + the house layer at module-load and embeds them verbatim. If a section header is renamed, the engine throws — methodology and prompts cannot drift.

## File map

| File | Loaded by | Purpose |
|---|---|---|
| `01-house.md` | every LLM surface | Universal principles. Treated like the Manifesto. |
| `02-chat.md` | chat engine | Peer thinking-partner slice. |
| `03-scripts.md` | scripts engine | Full script-writer slice. Heaviest. |
| `04-analyst.md` | future analyst engine | Metrics interpretation slice. |
| `05-onboarding-updates.md` | (proposal) | New onboarding fields needed to feed the methodology. |

## What this is NOT

- A full doctrine. It distils a working agency's methodology into the smallest set of rules that actually changes outputs. Nuance lives in the source files in `/examples/` — go there if you ever need to defend a specific rule.
- A copy of Alex / ABS. All client-specific positioning has been stripped. What remains is the principles any creator could plug into.
