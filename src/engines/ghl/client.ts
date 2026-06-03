/**
 * Minimal GoHighLevel API v2 client (BO-080).
 *
 * Only what the payment->onboarding bridge needs: upsert a contact by
 * email and tag it so GHL's onboarding workflow (trigger: "Contact Tag")
 * fires. The account is white-labelled (hookd-digital.top) but the API
 * host is the shared services.leadconnectorhq.com.
 *
 * Auth: a Private Integration Token (Bearer) scoped contacts.write +
 * contacts.readonly, plus the sub-account Location ID. Both from env.
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export class GhlApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "GhlApiError";
  }
}

export interface GhlConfig {
  token: string;
  locationId: string;
}

/** Read GHL API config from env. Throws loudly if either is missing. */
export function loadGhlConfig(): GhlConfig {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error(
      "GHL API env missing. Set GHL_API_TOKEN and GHL_LOCATION_ID.",
    );
  }
  return { token, locationId };
}

export interface UpsertContactInput {
  email: string;
  name: string | null;
  /** Tags to attach (appended; existing tags are kept). */
  tags: string[];
  /** Free-text attribution, e.g. "stripe" / "fanbasis". */
  source?: string;
}

export interface UpsertContactResult {
  contactId: string;
  isNew: boolean;
}

/**
 * Upsert a contact by email into the configured location and attach tags.
 * Adding a tag here is what triggers GHL's onboarding workflow.
 */
export async function upsertContact(
  config: GhlConfig,
  input: UpsertContactInput,
  fetchImpl: typeof fetch = fetch,
): Promise<UpsertContactResult> {
  const body: Record<string, unknown> = {
    locationId: config.locationId,
    email: input.email,
    tags: input.tags,
  };
  if (input.name) body.name = input.name;
  if (input.source) body.source = input.source;

  const res = await fetchImpl(`${GHL_API_BASE}/contacts/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new GhlApiError(
      `contacts/upsert returned non-JSON (HTTP ${res.status})`,
      res.status,
    );
  }

  if (!res.ok) {
    const msg =
      (parsed as { message?: string } | null)?.message ??
      `contacts/upsert failed (HTTP ${res.status})`;
    throw new GhlApiError(msg, res.status, parsed);
  }

  const obj = parsed as { contact?: { id?: string }; new?: boolean };
  const contactId = obj.contact?.id;
  if (typeof contactId !== "string") {
    throw new GhlApiError(
      "contacts/upsert response missing contact.id",
      res.status,
      parsed,
    );
  }
  return { contactId, isNew: obj.new === true };
}
