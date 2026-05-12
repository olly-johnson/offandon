import type { ClientSourceFile } from "./types";

/**
 * Pinned to Sonnet 4.6 in production. Ingestion is a one-shot per client,
 * not a hot path — the cost-quality tradeoff favours the larger model.
 */
export const INGESTION_MODEL = "claude-sonnet-4-6";

/**
 * Cap chosen to keep the Anthropic SDK in non-streaming mode.
 *
 * The SDK refuses non-streaming calls where `max_tokens > 21,333` (see
 * `calculateNonstreamingTimeout` in @anthropic-ai/sdk: any maxTokens
 * whose expected wall-clock exceeds 10 minutes throws). 16K gives 3-4x
 * headroom over the real extract size for the heaviest client folders
 * (Alex's: ~8-12k output tokens) while keeping the wire request simple.
 *
 * If a future client's extract truncates here, switch the underlying
 * call to `messages.stream()` rather than raising this further.
 */
export const INGESTION_MAX_TOKENS = 16_000;

/** Hard ceiling per source file body before we summarise. Files larger than
 * this get truncated head + tail with a centre marker so the LLM sees the
 * shape without burning context on the middle. */
export const INGESTION_MAX_FILE_CHARS = 40_000;

/**
 * System prompt for the per-client ingestion pass.
 *
 * Schema-first: the model must return a single JSON object matching
 * `ExtractedClientData`. Free prose is forbidden. We tolerate prose
 * wrappers at parse time anyway, but instructing strict JSON cuts the
 * cleanup work down.
 *
 * Anti-hallucination guardrails:
 * - "If a field has no support in the files, leave it empty/absent"
 *   (prevents the model inventing pain_points to fill an ICPProfile).
 * - "Quote raw text where possible" (voice_samples especially — the
 *   downstream prompt builder treats these as verbatim).
 * - "Never invent example_creators or prohibited_phrases" (high-leverage
 *   fields that poison generation if wrong).
 */
export const INGESTION_SYSTEM_PROMPT = `You distill operator-curated source files about a single content creator into the strict JSON schema below. The schema mirrors our database; the operator commits it directly so accuracy matters more than completeness.

Hard rules:
- Output ONE JSON object. No prose, no markdown fences, no commentary.
- Quote verbatim from source files for: voice_samples, story bodies, signature_phrases, raw positioning statements. Do not paraphrase.
- If a field has no support in the files, omit it or leave it as an empty array. Never invent content to fill a slot.
- Use the source_file field on every client_assets entry. Format: "relative/path.md" or "relative/path.md#anchor" when an asset comes from a section of a larger file.
- prohibited_phrases must come from the creator's own anti-patterns. Do not add generic AI-slop words unless the file explicitly lists them.

Schema (every field is required unless marked optional):

{
  "profile": {
    "display_name": string,
    "handle": string?  // optional, e.g. instagram username
  },
  "voice_dna": {
    "tone_profile": {
      "primary": string,           // one short label, e.g. "grounded-direct"
      "energy": "low" | "medium" | "high",
      "formality": "casual" | "conversational" | "formal",
      "descriptors": string[]      // adjectives that describe the voice
    },
    "content_pillars": [
      { "name": string, "description": string, "example_topics": string[] }
    ],
    "prohibited_phrases": string[],
    "audience_persona": {
      "description": string,
      "pain_points": string[],
      "aspirations": string[],
      "language_register": string
    },
    "generated_at": string,        // ISO 8601. Use the current timestamp you were given.
    "source_questionnaire_hash": string  // sha256 of source_answers JSON. Use the literal string "ingestion" if you cannot compute one — the persistence layer recomputes.
  },
  "source_answers": {
    "niche": string,
    "business_description": string,
    "goals": string[],
    "voice_samples": string[],     // verbatim, 2-4 sentences each. Pulled from voice_profile.md "Raw Voice Samples" or transcripts.
    "what_works": string,
    "where_stuck": string,
    "icp": {
      "pain_points": string[],
      "desires": string[],
      "thoughts_at_2am": string[],
      "internal_battles": string[],
      "dreams": string[]
    },
    "positioning": {
      "core_philosophy": string,
      "contrarian_belief": string,
      "differentiator": string
    },
    "story_bank": {                // optional; 3 seed slots (the full bank lives in client_assets)
      "rock_bottom": string?,
      "breakthrough": string?,
      "current_journey": string?
    },
    "voice_signals": {             // optional
      "signature_phrases": string[]?,
      "swearing_level": "none" | "light" | "strategic" | "frequent",
      "humor_style": "self_deprecating" | "dry" | "banter" | "none",
      "energy": "calm_authority" | "high_energy" | "reflective" | "intense"
    },
    "example_creators": [          // optional
      { "name": string, "platform": string?, "why": string? }
    ],
    "preferred_topics": string[]?,
    "user_prohibited_phrases": string[]?
  },
  "client_assets": [
    {
      "asset_type": "story" | "viral_reference" | "past_script" | "template",
      "title": string,
      "body": string,              // raw markdown / quote. For stories this is the verbatim story text.
      "metadata": {                // type-specific. Use only fields listed below.
        // story:   { category, funnel_fit, emotions: string[], universal_truth, times_used }
        // viral_reference: { creator, platform, url, why_it_worked }
        // past_script:     { format, performance }
        // template:        { funnel_fit }
      },
      "source_file": string
    }
  ],
  "user_memories": [
    {
      "fact": string,              // single concrete fact, < 280 chars
      "category": "ongoing_project" | "creator_context" | "preference" | "recent_topic",
      "priority": 1 | 2 | 3 | 4 | 5
    }
  ],
  "user_methodology": string       // plain text overlay loaded into every surface prompt. Consolidate CTAs, quality_learnings (good patterns), and brand-specific creative direction here. 500-2000 chars typically. Empty string is fine.
}

Source-to-schema mapping (when these files are present):
- voice_profile.md          -> voice_dna (tone, prohibited_phrases from anti-patterns) + source_answers.voice_samples + source_answers.voice_signals + source_answers.positioning
- story_bank.md             -> client_assets[asset_type=story], one per entry. Preserve the structured fields in metadata.
- example_creators.md       -> source_answers.example_creators
- content_identity.md       -> source_answers.positioning (and merge into voice_dna.audience_persona)
- config.json               -> voice_dna.content_pillars, source_answers.icp, source_answers.goals, user_methodology (CTAs go here)
- viral_references/*.md     -> client_assets[asset_type=viral_reference]
- quality_learnings.md      -> user_methodology (good patterns) + voice_dna.prohibited_phrases (failure patterns that are about specific words/phrases)
- *_creative_direction.md   -> user_methodology
- transcripts/              -> source_answers.voice_samples (verbatim quotes only; do NOT store transcripts as past_script assets — too noisy)

Return ONLY the JSON object.`;

/**
 * Build the user message for the ingestion call. Files are concatenated
 * with explicit XML-ish delimiters; the model treats them as labelled
 * inputs. We truncate any single file over INGESTION_MAX_FILE_CHARS so
 * one runaway transcript doesn't blow the context budget.
 */
export function buildIngestionUserPrompt(args: {
  clientSlug: string;
  files: ClientSourceFile[];
  /** ISO 8601 timestamp the model should stamp into voice_dna.generated_at. */
  nowIso: string;
}): string {
  const fileBlocks = args.files.map((f) => {
    const body =
      f.body.length > INGESTION_MAX_FILE_CHARS
        ? `${f.body.slice(0, INGESTION_MAX_FILE_CHARS / 2)}\n\n[... truncated ${
            f.body.length - INGESTION_MAX_FILE_CHARS
          } chars ...]\n\n${f.body.slice(-INGESTION_MAX_FILE_CHARS / 2)}`
        : f.body;
    return `<file path="${f.relativePath}">\n${body}\n</file>`;
  });

  return [
    `Client slug: ${args.clientSlug}`,
    `Current timestamp (use for voice_dna.generated_at): ${args.nowIso}`,
    "",
    "Source files follow. Distill them into the schema specified in the system prompt. Return ONLY the JSON object.",
    "",
    ...fileBlocks,
  ].join("\n");
}
