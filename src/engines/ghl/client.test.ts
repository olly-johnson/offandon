import { describe, expect, it, vi } from "vitest";

import { GhlApiError, upsertContact, type GhlConfig } from "./client";

const config: GhlConfig = { token: "pit_abc", locationId: "loc_123" };

type FetchFn = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(init?.body as string);
}

describe("upsertContact", () => {
  it("POSTs to /contacts/upsert with auth, version, location, email + tags", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      jsonResponse(200, { new: true, contact: { id: "contact_1" } }),
    );

    const result = await upsertContact(
      config,
      { email: "a@b.com", name: "Olly Johnson", tags: ["client_paid"], source: "stripe" },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({ contactId: "contact_1", isNew: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://services.leadconnectorhq.com/contacts/upsert");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer pit_abc");
    expect(headers.Version).toBe("2021-07-28");
    expect(sentBody(init)).toMatchObject({
      locationId: "loc_123",
      email: "a@b.com",
      name: "Olly Johnson",
      tags: ["client_paid"],
      source: "stripe",
    });
  });

  it("reports isNew false for an existing contact", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      jsonResponse(200, { new: false, contact: { id: "c2" } }),
    );
    const r = await upsertContact(
      config,
      { email: "x@y.com", name: null, tags: ["client_paid"] },
      fetchMock as unknown as typeof fetch,
    );
    expect(r.isNew).toBe(false);
  });

  it("throws GhlApiError on a non-2xx response", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      jsonResponse(401, { message: "Invalid token" }),
    );
    await expect(
      upsertContact(
        config,
        { email: "a@b.com", name: null, tags: [] },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow(GhlApiError);
  });

  it("omits name when null", async () => {
    const fetchMock = vi.fn<FetchFn>(async () =>
      jsonResponse(200, { new: true, contact: { id: "c" } }),
    );
    await upsertContact(
      config,
      { email: "a@b.com", name: null, tags: ["client_paid"] },
      fetchMock as unknown as typeof fetch,
    );
    expect(sentBody(fetchMock.mock.calls[0][1])).not.toHaveProperty("name");
  });
});
