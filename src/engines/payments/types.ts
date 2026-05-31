/**
 * Normalised payment event (BO-080).
 *
 * Both Fanbasis and Stripe payment webhooks are parsed down to this
 * single shape so the route logic (upsert the contact into GHL + tag for
 * onboarding) is identical regardless of processor.
 */

export type PaymentProvider = "stripe" | "fanbasis";

export interface PaymentEvent {
  provider: PaymentProvider;
  /** Lowercased, trimmed buyer email. The key we upsert into GHL by. */
  email: string;
  /** Buyer name as supplied by the processor, or null. */
  name: string | null;
  /** Amount in minor units (cents), or null when absent. */
  amountCents: number | null;
  /** ISO 4217, e.g. "USD" / "GBP", or null. */
  currency: string | null;
  /** Processor's own id (payment_id / session id) for logging + idempotency. */
  externalId: string;
}
