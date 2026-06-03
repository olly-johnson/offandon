/**
 * Turn a verified payment into GHL onboarding enrolment (BO-080).
 *
 * Upserts the buyer as a GHL contact and attaches the onboarding tag
 * (default "client_paid"), which is what GHL's onboarding workflow
 * triggers on ("Contact Tag added"). Shared by both payment routes so
 * Stripe and Fanbasis behave identically.
 */

import { loadGhlConfig, upsertContact } from "@/engines/ghl";
import { createLogger } from "@/lib/shared/logger";

import type { PaymentEvent } from "./types";

const log = createLogger("payments.enrol");
const DEFAULT_ONBOARDING_TAG = "client_paid";

export async function enrolInOnboarding(event: PaymentEvent): Promise<void> {
  const config = loadGhlConfig();
  const tag = process.env.GHL_ONBOARDING_TAG?.trim() || DEFAULT_ONBOARDING_TAG;

  const { contactId, isNew } = await upsertContact(config, {
    email: event.email,
    name: event.name,
    tags: [tag],
    source: event.provider,
  });

  log.info("payment enrolled into GHL onboarding", {
    provider: event.provider,
    email: event.email,
    contact_id: contactId,
    is_new: isNew,
    tag,
    external_id: event.externalId,
    amount_cents: event.amountCents,
  });
}
