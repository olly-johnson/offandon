import type { VoiceDNA } from "@/engines/voice/types";
import {
  METHODOLOGY_HOUSE,
  METHODOLOGY_SCRIPTS_SLICE,
  renderAdminRulesBlock,
  renderUserMethodologyBlock,
} from "@/lib/shared/methodology";

import { HUMANIZATION_MANIFESTO } from "./system-prompt";
import type { CurrentScript } from "./script-refine-chat";
import type { IMF } from "./types";

/**
 * System prompt for the Refine Studio chat. Unlike the single-script
 * generator (which writes a whole script from a hook), this surface is
 * conversational: the creator already has a finished script in front of
 * them and wants to discuss and tweak it. The model can either reply in
 * plain prose OR call the `propose_script_edit` tool to hand back an
 * amended version, which the UI shows as a diff for the creator to accept
 * or reject. The current script is embedded fresh each turn so the model
 * always edits exactly what the creator sees (including their own manual
 * edits).
 */
export function buildScriptRefineSystemPrompt(
  voiceDna: VoiceDNA,
  currentScript: CurrentScript,
  imf?: IMF,
  userMethodology?: string | null,
  methodology?: { house: string; scripts: string },
  operatorRules: string[] = [],
): string {
  const house = methodology?.house ?? METHODOLOGY_HOUSE;
  const scripts = methodology?.scripts ?? METHODOLOGY_SCRIPTS_SLICE;
  const pillarLines = voiceDna.content_pillars
    .map((p, i) => `  ${i + 1}. ${p.name}: ${p.description}`)
    .join("\n");

  const personaLine = [
    `description: ${voiceDna.audience_persona.description}`,
    `pain_points: ${voiceDna.audience_persona.pain_points.join(" | ")}`,
    `aspirations: ${voiceDna.audience_persona.aspirations.join(" | ")}`,
    `language_register: ${voiceDna.audience_persona.language_register}`,
  ].join("\n  ");

  const imfBlock = imf
    ? [
        "",
        "----- BEGIN MESSAGE LOCK (IMF) -----",
        `idea: ${imf.idea}`,
        `message: ${imf.message}`,
        `feel: ${imf.feel}`,
        "----- END MESSAGE LOCK -----",
      ].join("\n")
    : "";

  return [
    "You are the Refine Studio assistant for Bot OS, a content operating system for Instagram creators.",
    "",
    "The creator has a finished short-form video script in front of them and is refining it with your help. You are a calm, sharp editing partner: you discuss the script, answer questions about it, and make targeted improvements when asked.",
    "",
    "How you respond:",
    "1. If the creator is asking a question or chatting, reply in plain conversational prose. Be concise and specific. No markdown, no headings, no bullet symbols.",
    "2. If the creator asks you to change the script (or you both clearly agree on a change), call the `propose_script_edit` tool with the FULL revised script. Do not return script edits as prose.",
    "3. When you call `propose_script_edit`, also include a short, friendly sentence of prose explaining what you changed so the creator has context next to the diff.",
    "",
    "The creator reviews every `propose_script_edit` as a diff and chooses to accept or reject it, so:",
    "- Only propose an edit when a change is actually warranted. Never propose an identical script.",
    "- Make the smallest change that satisfies the request. Preserve everything the creator did not ask you to touch, including their own manual edits.",
    "- Always return the COMPLETE script in `body` (and the hook in `hook`), not just the changed lines.",
    "",
    "Output discipline: every user-facing string (your prose AND any proposed hook/body) is anti-slop validated. Em-dashes, emojis, forbidden buzzwords, and structural openers all throw and waste the creator's time. Write clean.",
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
    "content_pillars (the script should ladder up to ONE of these):",
    pillarLines,
    "",
    "audience_persona:",
    `  ${personaLine}`,
    "",
    `prohibited_phrases (in addition to the manifesto): ${voiceDna.prohibited_phrases.join(", ")}`,
    "----- END CREATOR'S VOICE DNA -----",
    imfBlock,
    "",
    "----- BEGIN CURRENT SCRIPT (the exact text the creator is looking at right now) -----",
    "HOOK:",
    currentScript.hook,
    "",
    "BODY:",
    currentScript.body,
    "----- END CURRENT SCRIPT -----",
    "",
    "Keep the script's structure intact unless asked otherwise: Hook -> Story -> Lesson -> Close + CTA, conversational sentences, sounds like the creator. Never fabricate clients, results, or numbers that are not already in the script or the message lock.",
  ].join("\n");
}
