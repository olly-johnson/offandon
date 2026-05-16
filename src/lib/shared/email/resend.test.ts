import { describe, expect, it, vi } from "vitest";

import { ResendEmailClient } from "./resend";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function makeFetch(response: { ok: boolean; status: number; body: unknown }): FetchMock {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("ResendEmailClient", () => {
  it("posts to /emails with bearer auth and returns the message id", async () => {
    const fetchImpl = makeFetch({ ok: true, status: 200, body: { id: "re_abc" } });
    const client = new ResendEmailClient({
      apiKey: "test-key",
      from: "Off&On <weekly@example.com>",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.send({
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: "weekly-send-2026-05-11-user@example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.id).toBe("re_abc");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0]!;
    const requestInit = call[1] as RequestInit & {
      headers: Record<string, string>;
    };
    expect(requestInit.headers["Authorization"]).toBe("Bearer test-key");
    expect(requestInit.headers["Idempotency-Key"]).toBe(
      "weekly-send-2026-05-11-user@example.com",
    );
    const body = JSON.parse(requestInit.body as string);
    expect(body.from).toBe("Off&On <weekly@example.com>");
    expect(body.to).toEqual(["user@example.com"]);
  });

  it("returns ok=false with the resend error body on non-2xx", async () => {
    const fetchImpl = makeFetch({
      ok: false,
      status: 422,
      body: { message: "validation_error" },
    });
    const client = new ResendEmailClient({
      apiKey: "k",
      from: "f@example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.send({
      to: "user@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(result.ok).toBe(false);
    expect(result.id).toBeNull();
    expect(result.error).toContain("422");
  });

  it("returns ok=false on network error", async () => {
    const client = new ResendEmailClient({
      apiKey: "k",
      from: "f@example.com",
      fetchImpl: (async () => {
        throw new Error("boom");
      }) as unknown as typeof fetch,
    });
    const result = await client.send({
      to: "u@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
  });
});
