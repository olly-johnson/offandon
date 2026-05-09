import { Inngest } from "inngest";

/**
 * Single Inngest client for the whole app. Functions register against this;
 * the serve endpoint at /api/inngest exposes them; server actions emit events.
 *
 * Local dev: run `npx inngest-cli@latest dev` in a separate terminal.
 *   The CLI auto-discovers /api/inngest on http://localhost:3000 and routes
 *   events without needing INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY.
 *
 * Production: requires INNGEST_EVENT_KEY (auto-picked up by the SDK from env)
 * and INNGEST_SIGNING_KEY (used by the serve endpoint to verify incoming
 * webhook calls from Inngest's cloud).
 */
export const inngest = new Inngest({
  id: "bot-os",
});

/**
 * Strongly-typed event names. Single source of truth so producers (server
 * actions) and consumers (functions) cannot drift on the string.
 */
export const INNGEST_EVENTS = {
  ScriptsBatchRequested: "scripts/batch.requested",
} as const;

/**
 * Payload shape for scripts/batch.requested. The function loads the rest
 * (voice DNA, count) from the script_batches row referenced by batch_id;
 * we keep the event payload deliberately small.
 */
export interface ScriptsBatchRequestedData {
  batch_id: string;
  user_id: string;
}
