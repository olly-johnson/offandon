/**
 * Thin HTTP client for the Fathom REST API.
 *
 * Confirmed shape: GET /external/v1/meetings?limit=N&cursor=X with auth via
 * X-Api-Key header. Cursor-paginated, newest first. The response inlines
 * the full transcript for each meeting, so a separate fetch-by-id endpoint
 * isn't needed (and Fathom doesn't expose one externally).
 *
 * The backfill script paginates this list to seed every existing recording;
 * the webhook receives essentially the same shape per recording.
 */

import { createLogger } from "@/lib/shared/logger";

import { normaliseRecording } from "./webhook";

import type {
  FathomMeetingsPage,
  FathomRecording,
  IFathomClient,
} from "./types";

const log = createLogger("fathom.client");

export const FATHOM_API_BASE_URL = "https://api.fathom.ai/external/v1";

export interface FathomApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface RawListResponse {
  items?: unknown[];
  next_cursor?: string | null;
  limit?: number;
}

export class FathomApiClient implements IFathomClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FathomApiClientOptions) {
    if (!opts.apiKey) {
      throw new Error("FathomApiClient: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? FATHOM_API_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async listMeetings(
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<FathomMeetingsPage> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.cursor) params.set("cursor", opts.cursor);
    const query = params.toString();
    const url = `${this.baseUrl}/meetings${query ? `?${query}` : ""}`;

    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const text = await safeReadText(res);
      log.warn("fathom api non-2xx", {
        url,
        status: res.status,
        body_excerpt: text.slice(0, 200),
      });
      throw new Error(`fathom listMeetings: ${res.status} ${text.slice(0, 120)}`);
    }
    const raw = (await res.json()) as RawListResponse;
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: FathomRecording[] = [];
    for (const entry of rawItems) {
      try {
        items.push(normaliseRecording(entry));
      } catch (err) {
        log.warn("skipping malformed meeting in listMeetings page", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      items,
      nextCursor: typeof raw.next_cursor === "string" ? raw.next_cursor : null,
    };
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
