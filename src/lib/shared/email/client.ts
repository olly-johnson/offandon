/**
 * Email delivery interface (BO-058).
 *
 * The weekly check-in cron and reminder cron speak to this shape, not to
 * Resend directly, so tests can inject a recording stub and the real
 * provider can be swapped without touching call sites. The production
 * binding is `ResendEmailClient`; the no-op `DryRunEmailClient` is what
 * gets used when no API key is configured (e.g. local dev / preview
 * deploys where we don't want to actually mail anyone).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Provider-side idempotency key. Use the same value for retries. */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  ok: boolean;
  /** Provider message ID. Null when delivery was skipped or failed. */
  id: string | null;
  error?: string;
}

export interface IEmailClient {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
