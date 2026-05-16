/**
 * Resend binding for IEmailClient.
 *
 * Resend is the email provider. We call its HTTPS API directly rather than
 * pulling in the `resend` npm package — the surface we need is one POST,
 * and adding a dependency for it isn't worth the supply-chain weight.
 *
 * Env vars:
 *   RESEND_API_KEY   server-only; from resend.com -> API Keys
 *   EMAIL_FROM       "Off&On <weekly@yourdomain.com>" — must be on a verified
 *                    sender domain in Resend.
 *
 * When RESEND_API_KEY is unset, `getEmailClient()` returns a dry-run
 * client that logs the message and reports ok=true without contacting the
 * network. That keeps local dev / preview branches from accidentally
 * mailing live users. Production deploys must set both vars or the cron
 * jobs are no-ops (intentional — fail closed).
 */

import { createLogger } from "@/lib/shared/logger";

import type { EmailMessage, EmailSendResult, IEmailClient } from "./client";

const log = createLogger("email.resend");

const RESEND_API_URL = "https://api.resend.com/emails";

export interface ResendEmailClientOptions {
  apiKey: string;
  from: string;
  /** Override for tests. */
  fetchImpl?: typeof fetch;
}

export class ResendEmailClient implements IEmailClient {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ResendEmailClientOptions) {
    this.apiKey = opts.apiKey;
    this.from = opts.from;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const body: Record<string, unknown> = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
    if (message.replyTo) body.reply_to = message.replyTo;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (message.idempotencyKey) {
      headers["Idempotency-Key"] = message.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("resend network error", { to: message.to, error: msg });
      return { ok: false, id: null, error: msg };
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log.error("resend non-2xx", {
        to: message.to,
        status: response.status,
        body_preview: errText.slice(0, 200),
      });
      return {
        ok: false,
        id: null,
        error: `resend status ${response.status}: ${errText.slice(0, 200)}`,
      };
    }

    const parsed = (await response.json().catch(() => ({}))) as { id?: string };
    log.info("resend send ok", { to: message.to, id: parsed.id ?? null });
    return { ok: true, id: parsed.id ?? null };
  }
}

/**
 * Logs and discards. Used when RESEND_API_KEY is unset. Behaves like a
 * successful send so cron jobs don't fail closed on local/preview.
 */
export class DryRunEmailClient implements IEmailClient {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    log.info("dry-run email (RESEND_API_KEY unset)", {
      to: message.to,
      subject: message.subject,
    });
    return { ok: true, id: null };
  }
}

/**
 * Resolve the right email client for the current env. Server-only —
 * never call from a browser bundle, since it reads RESEND_API_KEY.
 */
export function getEmailClient(): IEmailClient {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return new DryRunEmailClient();
  }
  return new ResendEmailClient({ apiKey, from });
}
