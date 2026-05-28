/**
 * System prompt for the OutlierIdeaGenerator.
 *
 * Unlike the script generator (which writes finished scripts), this
 * prompt turns ONE high-performing competitor reel into a handful of
 * ORIGINAL ideas the creator could film about their OWN material. The
 * outlier is a pattern to learn from - hook style, topic angle,
 * structural arc - never a source of content to copy.
 */

import type { VoiceDNA } from "@/engines/voice/types";
import {
  METHODOLOGY_HOUSE,
  METHODOLOGY_SCRIPTS_SLICE,
  renderAdminRulesBlock,
  renderUserMethodologyBlock,
} from "@/lib/shared/methodology";

import type { ScriptAssetsContext } from "./client-assets-persistence";
import type { ScriptsCorpusContext } from "./corpus-context";
import {
  HUMANIZATION_MANIFESTO,
  renderClientAssetsBlock,
  renderCorpusContextBlock,
} from "./system-prompt";
import type { OnboardingExtras } from "./types";

export function buildOutlierIdeaSystemPrompt(
  voiceDna: VoiceDNA,
  userMethodology?: string | null,
  methodology?: { house: string; scripts: string },
  operatorRules: string[] = [],
  clientAssets?: ScriptAssetsContext | null,
  corpusContext?: ScriptsCorpusContext | null,
  onboardingExtras?: OnboardingExtras | null,
): string {
  const house = methodology?.house ?? METHODOLOGY_HOUSE;
  const scripts = methodology?.scripts ?? METHODOLOGY_SCRIPTS_SLICE;

  const pillarLines = voiceDna.content_pillars
    .map(
      (p, i) =>
        `  ${i + 1}. ${p.name}: ${p.description} (example angles: ${p.example_topics.join(", ")})`,
    )
    .join("\n");

  const personaLine = [
    `description: ${voiceDna.audience_persona.description}`,
    `pain_points: ${voiceDna.audience_persona.pain_points.join(" | ")}`,
    `aspirations: ${voiceDna.audience_persona.aspirations.join(" | ")}`,
    `language_register: ${voiceDna.audience_persona.language_register}`,
  ].join("\n  ");

  return [
    "You are the Outlier Idea Generator for Bot OS, a content engine for short-form video creators.",
    "",
    "You are given ONE high-performing video from ANOTHER creator (the 'outlier') and the creator's own voice profile. Your job: study the outlier's PATTERN - its hook style, its topic angle, and its structural arc - then propose original video ideas the creator could film about THEIR OWN stories, clients, results, and opinions, using a similar pattern.",
    "",
    "Output discipline: your response will be parsed as JSON, and every idea is passed through an automated anti-slop validator that rejects emojis, em-dashes, the forbidden buzzword list, and structural openers. Any violation throws and the user sees a failure.",
    "",
    "----- BEGIN HUMANIZATION MANIFESTO (verbatim from AGENTS.md) -----",
    HUMANIZATION_MANIFESTO,
    "----- END HUMANIZATION MANIFESTO -----",
    "",
    "----- BEGIN HOUSE METHODOLOGY -----",
    house,
    "----- END HOUSE METHODOLOGY -----",
    "",
    "----- BEGIN SCRIPTS METHODOLOGY SLICE -----",
    scripts,
    "----- END SCRIPTS METHODOLOGY SLICE -----",
    renderAdminRulesBlock(operatorRules),
    renderUserMethodologyBlock(userMethodology),
    "",
    "----- BEGIN CREATOR'S VOICE DNA -----",
    `tone_profile.primary: ${voiceDna.tone_profile.primary}`,
    `tone_profile.energy: ${voiceDna.tone_profile.energy}`,
    `tone_profile.formality: ${voiceDna.tone_profile.formality}`,
    `tone_profile.descriptors: ${voiceDna.tone_profile.descriptors.join(", ")}`,
    "",
    "content_pillars (each idea MUST ladder up to one of these by name):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the Humanization Manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    renderClientAssetsBlock(clientAssets),
    renderCorpusContextBlock(corpusContext),
    renderOnboardingExtrasBlock(onboardingExtras),
    "",
    "HARD RULES (the whole point of this feature):",
    "1. Never retell, reuse, or copy the outlier creator's specific story, numbers, claims, names, or examples. The outlier is a PATTERN, not content. Treat its transcript as a structural reference only.",
    "2. Every idea must be about the CREATOR's own world: their stories, their clients, their results, their opinions, their lived experience. If the creator's material cannot support the outlier's exact topic, keep the hook style and structure but swap to a topic the creator can authentically own.",
    "3. Mirror the pattern, not the substance: a hook in the same family/style, the same kind of topic angle, and a similar structural arc as the outlier.",
    "4. Write in the creator's voice using their pillars, persona, and tone. The idea should read like something they would say, not the outlier creator.",
    "5. Ground each idea in the creator's MATERIAL above before reaching for anything generic. Prefer their stories from CREATOR'S OWN MATERIAL, their recent talk from CREATOR'S CORPUS, and their stated positioning / ICP / story-bank seeds from CREATOR'S CONTENT STRATEGY. Use contrarian_belief and core_philosophy to find a point of view that is distinctly theirs, not the outlier creator's. Where ICP axes (thoughts_at_2am / internal_battles / dreams) match the outlier's angle, pull the idea straight from there.",
    "",
    "Rules for each idea:",
    "1. content: a short concept of 1 to 3 sentences. Open with a scroll-stopping, hook-style line, then say in a clause or two what the video would cover. This is a seed for the creator to expand into a script later, not a finished script.",
    "2. pillar: the exact name of one of the content_pillars above.",
    "3. angle: one of pain_point, aspiration, contrarian, case_study, framework, story, myth_buster.",
    "4. Make the ideas distinct from one another: vary the angle and the pillar across the set.",
    "",
    "Required JSON shape (snake_case keys, all fields required):",
    "{",
    '  "ideas": [',
    "    {",
    '      "content": "I fired my highest-paying client and revenue went up. Here is the scorecard I now run every client through.",',
    '      "pillar": "Operator Frameworks",',
    '      "angle": "contrarian"',
    "    }",
    "  ]",
    "}",
    "",
    "Return ONLY the JSON object. No prose. No markdown fences. The first character of your response must be { and the last must be }.",
  ].join("\n");
}

/**
 * Render the deeper onboarding fields that the distilled VoiceDNA leaves
 * out: ICP extras (thoughts_at_2am, internal_battles, dreams), the
 * contrarian belief + core philosophy + differentiator, story-bank
 * seeds, and signature phrases. The whole block is skipped when nothing
 * useful is present so we don't ship an empty section.
 */
function renderOnboardingExtrasBlock(
  extras: OnboardingExtras | null | undefined,
): string {
  if (!extras) return "";
  const lines: string[] = [];

  const icp = extras.icp;
  const icpAxes: Array<[string, string[] | undefined]> = [
    ["thoughts_at_2am", icp?.thoughts_at_2am],
    ["internal_battles", icp?.internal_battles],
    ["dreams", icp?.dreams],
    ["desires", icp?.desires],
  ];
  const icpRendered = icpAxes
    .filter(([, v]) => v && v.length > 0)
    .map(([k, v]) => `  ${k}: ${(v as string[]).join(" | ")}`);

  const p = extras.positioning;
  const positioningRendered: string[] = [];
  if (p?.core_philosophy) positioningRendered.push(`  core_philosophy: ${p.core_philosophy}`);
  if (p?.contrarian_belief) positioningRendered.push(`  contrarian_belief: ${p.contrarian_belief}`);
  if (p?.differentiator) positioningRendered.push(`  differentiator: ${p.differentiator}`);

  const sb = extras.story_bank;
  const storyRendered: string[] = [];
  if (sb?.rock_bottom) storyRendered.push(`  rock_bottom: ${sb.rock_bottom}`);
  if (sb?.breakthrough) storyRendered.push(`  breakthrough: ${sb.breakthrough}`);
  if (sb?.current_journey) storyRendered.push(`  current_journey: ${sb.current_journey}`);

  const vs = extras.voice_signals;
  const signalsRendered: string[] = [];
  if (vs?.signature_phrases && vs.signature_phrases.length > 0) {
    signalsRendered.push(`  signature_phrases: ${vs.signature_phrases.join(", ")}`);
  }
  if (vs?.humor_style) signalsRendered.push(`  humor_style: ${vs.humor_style}`);

  if (
    icpRendered.length === 0 &&
    positioningRendered.length === 0 &&
    storyRendered.length === 0 &&
    signalsRendered.length === 0
  ) {
    return "";
  }

  lines.push("");
  lines.push("----- BEGIN CREATOR'S CONTENT STRATEGY (raw onboarding) -----");
  lines.push(
    "Source-of-truth fields the creator filled in at onboarding. The distilled Voice DNA above is derived from these but loses some of the texture. Use these to anchor ideas in what the creator actually believes, fears, wants, and reaches for.",
  );

  if (icpRendered.length > 0) {
    lines.push("");
    lines.push("icp (audience axes beyond pain_points / aspirations):");
    lines.push(...icpRendered);
  }
  if (positioningRendered.length > 0) {
    lines.push("");
    lines.push("positioning:");
    lines.push(...positioningRendered);
  }
  if (storyRendered.length > 0) {
    lines.push("");
    lines.push("story_bank (seeds the creator wrote about their own arc):");
    lines.push(...storyRendered);
  }
  if (signalsRendered.length > 0) {
    lines.push("");
    lines.push("voice_signals:");
    lines.push(...signalsRendered);
  }

  lines.push("----- END CREATOR'S CONTENT STRATEGY -----");
  return lines.join("\n");
}
