import { afterEach, describe, expect, it, vi } from "vitest";

import { InstagramClient } from "./client";

/**
 * Build a fake fetch that returns one canned response. `body` is what
 * `res.json()` resolves to; `status` drives the ok/error branches in
 * the client's private `get`.
 */
function makeFetch(body: unknown, status = 200) {
  const ok = status >= 200 && status < 300;
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

function calledUrl(fetchImpl: typeof fetch): URL {
  const calls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
    .calls;
  return new URL(calls[0][0] as string);
}

describe("InstagramClient.fetchMediaInsights", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests `views` (not the deprecated `plays`) for reels and maps it to plays", async () => {
    const fetchImpl = makeFetch({
      data: [
        { name: "reach", values: [{ value: 500 }] },
        { name: "views", values: [{ value: 700 }] },
        { name: "saved", values: [{ value: 4 }] },
        { name: "shares", values: [{ value: 1 }] },
      ],
    });
    const client = new InstagramClient({
      fetchImpl,
      baseUrl: "https://graph.test",
    });

    const insights = await client.fetchMediaInsights("tok", "m1", "REELS");

    const url = calledUrl(fetchImpl);
    expect(url.searchParams.get("metric")).toBe("reach,views,saved,shares");
    // `plays` is deprecated in the Graph API; one bad metric 400s the
    // whole request, so it must never appear.
    expect(url.searchParams.get("metric")).not.toContain("plays");

    expect(insights).toEqual({ reach: 500, plays: 700, saved: 4, shares: 1 });
  });

  it("requests `views` for legacy VIDEO too", async () => {
    const fetchImpl = makeFetch({ data: [] });
    const client = new InstagramClient({
      fetchImpl,
      baseUrl: "https://graph.test",
    });

    await client.fetchMediaInsights("tok", "m1", "VIDEO");

    expect(calledUrl(fetchImpl).searchParams.get("metric")).toBe(
      "reach,views,saved,shares",
    );
  });

  it("requests only image-supported metrics for IMAGE (no views)", async () => {
    const fetchImpl = makeFetch({ data: [] });
    const client = new InstagramClient({
      fetchImpl,
      baseUrl: "https://graph.test",
    });

    await client.fetchMediaInsights("tok", "m1", "IMAGE");

    expect(calledUrl(fetchImpl).searchParams.get("metric")).toBe(
      "reach,saved,shares",
    );
  });

  it("swallows an API error to all-null AND logs a warning (so it isn't silent)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = makeFetch(
      { error: { message: "metric[0] must be one of ..." } },
      400,
    );
    const client = new InstagramClient({
      fetchImpl,
      baseUrl: "https://graph.test",
    });

    const insights = await client.fetchMediaInsights("tok", "m1", "REELS");

    expect(insights).toEqual({
      reach: null,
      plays: null,
      saved: null,
      shares: null,
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain("instagram insights request failed");
    // the underlying API message must be captured for debugging
    expect(line).toContain("metric[0] must be one of");
  });
});
