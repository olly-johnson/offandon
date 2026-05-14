/**
 * Tool definitions for the Master Bot. Same shape as ChatEngine tools
 * but the schema is purpose-built for methodology editing.
 *
 * Note: propose_house_edit does NOT commit. It stages a proposal in
 * pending state; the admin must click Apply to commit. The other three
 * (rules) commit immediately, since rules are short and reversible.
 */

import type { ChatToolDefinition } from "@/engines/chat/types";

export const MASTER_BOT_TOOL_NAMES = [
  "add_rule",
  "update_rule",
  "delete_rule",
  "propose_house_edit",
] as const;

export type MasterBotToolName = (typeof MASTER_BOT_TOOL_NAMES)[number];

export interface MasterBotToolHandlers {
  add_rule: (args: { slice: string; rule: string }) => Promise<string>;
  update_rule: (args: { id: string; rule: string }) => Promise<string>;
  delete_rule: (args: { id: string }) => Promise<string>;
  propose_house_edit: (args: {
    slice: string;
    new_content: string;
    summary: string;
  }) => Promise<string>;
}

export function buildMasterBotTools(handlers: MasterBotToolHandlers): ChatToolDefinition[] {
  return [
    {
      name: "add_rule",
      description:
        "Append a short one-line rule to the operator rule list under a given slice. Use for clear imperative requests like 'never do X' or 'always do Y'. Prefer update_rule if a similar rule already exists.",
      input_schema: {
        type: "object",
        properties: {
          slice: {
            type: "string",
            enum: ["house", "chat", "scripts", "analyst"],
            description:
              "house = universal, chat = chat surface only, scripts = script generator, analyst = research analyst.",
          },
          rule: {
            type: "string",
            description: "Imperative one-liner, max 400 chars.",
          },
        },
        required: ["slice", "rule"],
      },
      handler: async (input) => {
        const slice = String(input.slice ?? "");
        const rule = String(input.rule ?? "");
        return handlers.add_rule({ slice, rule });
      },
    },
    {
      name: "update_rule",
      description:
        "Rewrite an existing operator rule. Use when the admin re-raises a topic that already has a rule (the rule ids are shown in the OPERATOR RULES block).",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string", description: "The rule id shown in [brackets]." },
          rule: { type: "string", description: "Updated rule text, max 400 chars." },
        },
        required: ["id", "rule"],
      },
      handler: async (input) => {
        const id = String(input.id ?? "");
        const rule = String(input.rule ?? "");
        return handlers.update_rule({ id, rule });
      },
    },
    {
      name: "delete_rule",
      description: "Remove an operator rule (soft delete; the admin can ask you to restore it later).",
      input_schema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
      handler: async (input) => {
        const id = String(input.id ?? "");
        return handlers.delete_rule({ id });
      },
    },
    {
      name: "propose_house_edit",
      description:
        "Stage a structural edit to a house methodology slice. Use when the request requires rewording or adding a section to the engine's base rule sheet (not just a one-line rule). The admin will see ONLY the summary, then click Apply or Discard. Provide the full new slice content plus a plain-English summary of what changed and why.",
      input_schema: {
        type: "object",
        properties: {
          slice: {
            type: "string",
            enum: ["house", "chat", "scripts", "analyst"],
          },
          new_content: {
            type: "string",
            description:
              "The FULL new slice content. Do not paste excerpts; the system overwrites the slice with exactly this text.",
          },
          summary: {
            type: "string",
            description:
              "One short paragraph in plain English: what would change in the engine's behaviour and why. The admin sees this, not the raw content.",
          },
        },
        required: ["slice", "new_content", "summary"],
      },
      handler: async (input) => {
        const slice = String(input.slice ?? "");
        const new_content = String(input.new_content ?? "");
        const summary = String(input.summary ?? "");
        return handlers.propose_house_edit({ slice, new_content, summary });
      },
    },
  ];
}
