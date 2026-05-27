import { describe, expect, it, vi } from "vitest";

import {
  ApifyConfigError,
  ApifyCompetitorScraper,
  buildReelScraperInput,
  encodeWebhooksParam,
  loadApifyConfig,
  parseReelItem,
} from "./scraper";

const ENV_KEYS = [
  "APIFY_API_KEY",
  "APIFY_WEBHOOK_SECRET",
  "APIFY_ACTOR_ID",
] as const;

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

describe("loadApifyConfig", () => {
  it("returns api key + actor id + webhook secret from env", () => {
    const config = withEnv(
      {
        APIFY_API_KEY: "apify_api_x",
        APIFY_WEBHOOK_SECRET: "shh",
        APIFY_ACTOR_ID: "apify~instagram-reel-scraper",
      },
      () => loadApifyConfig(),
    );
    expect(config).toEqual({
      apiKey: "apify_api_x",
      webhookSecret: "shh",
      actorId: "apify~instagram-reel-scraper",
    });
  });

  it("defaults actor id when env unset", () => {
    const config = withEnv(
      {
        APIFY_API_KEY: "apify_api_x",
        APIFY_WEBHOOK_SECRET: "shh",
        APIFY_ACTOR_ID: undefined,
      },
      () => loadApifyConfig(),
    );
    expect(config.actorId).toBe("apify~instagram-reel-scraper");
  });

  it("throws when APIFY_API_KEY is missing", () => {
    expect(() =>
      withEnv({ APIFY_API_KEY: undefined, APIFY_WEBHOOK_SECRET: "s" }, () =>
        loadApifyConfig(),
      ),
    ).toThrow(ApifyConfigError);
  });

  it("throws when APIFY_WEBHOOK_SECRET is missing", () => {
    expect(() =>
      withEnv({ APIFY_API_KEY: "k", APIFY_WEBHOOK_SECRET: undefined }, () =>
        loadApifyConfig(),
      ),
    ).toThrow(ApifyConfigError);
  });
});

describe("buildReelScraperInput", () => {
  it("returns actor input and webhooks separately (NOT merged)", () => {
    const run = buildReelScraperInput({
      username: "ollyj",
      resultsLimit: 30,
      webhookUrl: "https://app.example/api/apify/webhook",
      webhookSecret: "shh",
      runMetadata: { competitor_id: "c1", user_id: "u1" },
    });
    // Actor input never contains webhooks; Apify's API takes those via a
    // separate `?webhooks=` query parameter, not in the body.
    expect(run.input).toEqual({ username: ["ollyj"], resultsLimit: 30 });
    expect((run.input as unknown as Record<string, unknown>).webhooks).toBeUndefined();

    expect(run.webhooks).toHaveLength(1);
    expect(run.webhooks[0].eventTypes).toEqual([
      "ACTOR.RUN.SUCCEEDED",
      "ACTOR.RUN.FAILED",
      "ACTOR.RUN.ABORTED",
      "ACTOR.RUN.TIMED_OUT",
    ]);
    expect(JSON.parse(run.webhooks[0].headersTemplate)).toEqual({
      "X-Apify-Webhook-Token": "shh",
    });
    // Correlation IDs ride on the webhook URL as query params, NOT inside
    // a payload template — Apify's {{ }} substitution turned out to be
    // unreliable, so we let Apify send its default body and pull
    // competitor_id + user_id back off the URL server-side.
    const url = new URL(run.webhooks[0].requestUrl);
    expect(url.origin + url.pathname).toBe(
      "https://app.example/api/apify/webhook",
    );
    expect(url.searchParams.get("competitor_id")).toBe("c1");
    expect(url.searchParams.get("user_id")).toBe("u1");
    expect((run.webhooks[0] as unknown as Record<string, unknown>).payloadTemplate).toBeUndefined();
  });
});

describe("encodeWebhooksParam", () => {
  it("base64url-encodes the JSON array (URL-safe, no padding)", () => {
    const cfg = [
      {
        eventTypes: ["ACTOR.RUN.SUCCEEDED"],
        requestUrl: "https://app.example/api/apify/webhook",
        headersTemplate: '{"k":"v"}',
        payloadTemplate: "{}",
      },
    ];
    const encoded = encodeWebhooksParam(cfg);
    // base64url alphabet excludes + / =
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    expect(decoded).toEqual(cfg);
  });
});

describe("parseReelItem", () => {
  it("parses a typical apify reel result", () => {
    const raw = {
      shortCode: "Cxyz",
      type: "Video",
      url: "https://www.instagram.com/reel/Cxyz/",
      caption: "hello world",
      videoUrl: "https://cdn.instagram/v.mp4",
      displayUrl: "https://cdn.instagram/v.jpg",
      timestamp: "2026-05-19T12:00:00.000Z",
      likesCount: 200,
      commentsCount: 14,
      videoPlayCount: 5500,
      videoDuration: 41.32,
    };
    expect(parseReelItem(raw)).toEqual({
      id: "Cxyz",
      media_type: "REELS",
      caption: "hello world",
      permalink: "https://www.instagram.com/reel/Cxyz/",
      media_url: "https://cdn.instagram/v.mp4",
      thumbnail_url: "https://cdn.instagram/v.jpg",
      posted_at: "2026-05-19T12:00:00.000Z",
      like_count: 200,
      comments_count: 14,
      view_count: 5500,
      duration_seconds: 41.32,
    });
  });

  it("returns null when the item lacks a shortCode", () => {
    expect(parseReelItem({ caption: "no id" })).toBeNull();
  });

  it("treats non-video posts as null (we only ingest reels)", () => {
    expect(parseReelItem({ shortCode: "Cabc", type: "Image" })).toBeNull();
  });

  it("tolerates missing optional fields", () => {
    const parsed = parseReelItem({
      shortCode: "Cmin",
      type: "Video",
      url: null,
    });
    expect(parsed).toEqual({
      id: "Cmin",
      media_type: "REELS",
      caption: null,
      permalink: null,
      media_url: null,
      thumbnail_url: null,
      posted_at: null,
      like_count: null,
      comments_count: null,
      view_count: null,
      duration_seconds: null,
    });
  });
});

describe("ApifyCompetitorScraper.startReelScrape", () => {
  it("POSTs to the actor runs endpoint with webhooks as base64url query param", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: { id: "run-1", status: "READY", defaultDatasetId: "ds-1" },
      }),
    } as unknown as Response);

    const scraper = new ApifyCompetitorScraper({
      apiKey: "apify_api_x",
      webhookSecret: "shh",
      actorId: "apify~instagram-reel-scraper",
      fetchImpl,
    });
    const out = await scraper.startReelScrape({
      username: "ollyj",
      resultsLimit: 30,
      webhookUrl: "https://app.example/api/apify/webhook",
      runMetadata: { competitor_id: "c1", user_id: "u1" },
    });

    expect(out).toEqual({ actorRunId: "run-1", defaultDatasetId: "ds-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://api.apify.com/v2/acts/apify~instagram-reel-scraper/runs",
    );
    const webhooksParam = parsedUrl.searchParams.get("webhooks");
    expect(webhooksParam).toBeTruthy();
    const decodedWebhooks = JSON.parse(
      Buffer.from(webhooksParam as string, "base64url").toString("utf8"),
    );
    expect(decodedWebhooks).toHaveLength(1);
    const webhookUrl = new URL(decodedWebhooks[0].requestUrl);
    expect(webhookUrl.origin + webhookUrl.pathname).toBe(
      "https://app.example/api/apify/webhook",
    );
    expect(webhookUrl.searchParams.get("competitor_id")).toBe("c1");
    expect(webhookUrl.searchParams.get("user_id")).toBe("u1");

    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer apify_api_x");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    // Body is actor input only — webhooks must NOT leak into the body.
    expect(body).toEqual({ username: ["ollyj"], resultsLimit: 30 });
    expect(body.webhooks).toBeUndefined();
  });

  it("throws on non-2xx from Apify", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "out of credit",
    } as unknown as Response);
    const scraper = new ApifyCompetitorScraper({
      apiKey: "k",
      webhookSecret: "s",
      actorId: "a",
      fetchImpl,
    });
    await expect(
      scraper.startReelScrape({
        username: "x",
        resultsLimit: 10,
        webhookUrl: "https://app.example/api/apify/webhook",
        runMetadata: { competitor_id: "c1", user_id: "u1" },
      }),
    ).rejects.toThrow(/Apify start.*402/);
  });
});

describe("ApifyCompetitorScraper.fetchDatasetItems", () => {
  it("GETs the dataset items endpoint with bearer auth and parses reels", async () => {
    const items = [
      {
        shortCode: "Cxyz",
        type: "Video",
        url: "https://instagram.com/reel/Cxyz/",
        videoUrl: "https://cdn/v.mp4",
        likesCount: 1,
      },
      { shortCode: "Cimg", type: "Image" }, // dropped: not a reel
      { caption: "no id" }, // dropped: no shortcode
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => items,
    } as unknown as Response);

    const scraper = new ApifyCompetitorScraper({
      apiKey: "k",
      webhookSecret: "s",
      actorId: "a",
      fetchImpl,
    });
    const out = await scraper.fetchDatasetItems("ds-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      "https://api.apify.com/v2/datasets/ds-1/items?clean=true&format=json",
    );
    expect((init as RequestInit).method ?? "GET").toBe("GET");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer k");

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("Cxyz");
    expect(out[0].media_type).toBe("REELS");
  });
});
