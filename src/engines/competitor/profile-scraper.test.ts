import { describe, expect, it, vi } from "vitest";

import { ApifyProfileScraper } from "./profile-scraper";

function makeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch;
}

const IG_PROFILE_HD = "https://scontent.cdninstagram.com/abc.jpg";

describe("ApifyProfileScraper.fetchInstagramAvatarUrl", () => {
  it("posts to the run-sync-get-dataset-items endpoint with the actor id + handle", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ profilePicUrlHD: IG_PROFILE_HD }]), {
        status: 200,
      }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });

    const url = await scraper.fetchInstagramAvatarUrl("alexhormozi");

    expect(url).toBe(IG_PROFILE_HD);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const [calledUrl, init] = calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(
      "/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer k",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      usernames: ["alexhormozi"],
    });
  });

  it("falls back to profilePicUrl when no HD url is present", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(
        JSON.stringify([{ profilePicUrl: "https://example.com/lo.jpg" }]),
        { status: 200 },
      ),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    const url = await scraper.fetchInstagramAvatarUrl("garyvee");
    expect(url).toBe("https://example.com/lo.jpg");
  });

  it("returns null when the actor returns an empty dataset", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    expect(await scraper.fetchInstagramAvatarUrl("ghost")).toBeNull();
  });

  it("returns null when the row has no profile pic fields at all", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ username: "x" }]), { status: 200 }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    expect(await scraper.fetchInstagramAvatarUrl("x")).toBeNull();
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response("nope", { status: 429 }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    await expect(
      scraper.fetchInstagramAvatarUrl("anyone"),
    ).rejects.toThrow(/429/);
  });

  it("throws when the response is not an array", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify({ not: "array" }), { status: 200 }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    await expect(
      scraper.fetchInstagramAvatarUrl("x"),
    ).rejects.toThrow(/array/i);
  });

  it("strips a leading @ from the handle", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ profilePicUrlHD: IG_PROFILE_HD }]), {
        status: 200,
      }),
    );
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      fetchImpl,
    });
    await scraper.fetchInstagramAvatarUrl("@alexhormozi");
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(JSON.parse(String((calls[0] as [string, RequestInit])[1].body))).toEqual(
      { usernames: ["alexhormozi"] },
    );
  });
});

const TT_AVATAR = "https://p16-sign-va.tiktokcdn.com/avatar.jpeg?x-expires=1";

describe("ApifyProfileScraper.fetchTiktokAvatarUrl", () => {
  function ttScraper(fetchImpl: typeof fetch) {
    return new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      tiktokActorId: "clockworks~tiktok-scraper",
      fetchImpl,
    });
  }

  it("posts to the TikTok actor with a single-result profile probe", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ authorMeta: { avatar: TT_AVATAR } }]), {
        status: 200,
      }),
    );
    const url = await ttScraper(fetchImpl).fetchTiktokAvatarUrl("@GaryVee");

    expect(url).toBe(TT_AVATAR);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [calledUrl, init] = calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(
      "/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      profiles: ["garyvee"],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    });
  });

  it("falls back through avatar size variants", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(
        JSON.stringify([{ authorMeta: { avatarMedium: "https://tt/med.jpg" } }]),
        { status: 200 },
      ),
    );
    expect(await ttScraper(fetchImpl).fetchTiktokAvatarUrl("x")).toBe(
      "https://tt/med.jpg",
    );
  });

  it("returns null on an empty dataset", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
    expect(await ttScraper(fetchImpl).fetchTiktokAvatarUrl("ghost")).toBeNull();
  });

  it("returns null when the item carries no author avatar", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ id: "1", authorMeta: {} }]), { status: 200 }),
    );
    expect(await ttScraper(fetchImpl).fetchTiktokAvatarUrl("x")).toBeNull();
  });

  it("throws on non-2xx", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response("rate limited", { status: 429 }),
    );
    await expect(
      ttScraper(fetchImpl).fetchTiktokAvatarUrl("anyone"),
    ).rejects.toThrow(/429/);
  });
});

describe("ApifyProfileScraper.fetchAvatarUrl routing", () => {
  it("routes instagram + tiktok and returns null for unsupported platforms", async () => {
    const fetchImpl = makeFetch(async (url) => {
      if (url.includes("instagram-profile-scraper")) {
        return new Response(JSON.stringify([{ profilePicUrlHD: IG_PROFILE_HD }]), {
          status: 200,
        });
      }
      return new Response(JSON.stringify([{ authorMeta: { avatar: TT_AVATAR } }]), {
        status: 200,
      });
    });
    const scraper = new ApifyProfileScraper({
      apiKey: "k",
      instagramActorId: "apify~instagram-profile-scraper",
      tiktokActorId: "clockworks~tiktok-scraper",
      fetchImpl,
    });

    expect(await scraper.fetchAvatarUrl("instagram", "hormozi")).toBe(IG_PROFILE_HD);
    expect(await scraper.fetchAvatarUrl("tiktok", "garyvee")).toBe(TT_AVATAR);
    expect(await scraper.fetchAvatarUrl("youtube_shorts", "mkbhd")).toBeNull();
  });
});
