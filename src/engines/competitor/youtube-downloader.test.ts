import { describe, expect, it, vi } from "vitest";

import {
  ApifyYoutubeDownloader,
  parseDownloaderItem,
} from "./youtube-downloader";

const KVS_URL = "https://api.apify.com/v2/key-value-stores/abc/records/x.mp4";

function makeFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch;
}

describe("ApifyYoutubeDownloader.fetchMediaUrl", () => {
  it("posts the video url to the downloader actor and returns the KVS link", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([{ videoFile: KVS_URL }]), { status: 200 }),
    );
    const downloader = new ApifyYoutubeDownloader({
      apiKey: "k",
      actorId: "streamers~youtube-video-downloader",
      fetchImpl,
    });

    const out = await downloader.fetchMediaUrl(
      "https://www.youtube.com/shorts/abc",
    );

    expect(out).toBe(KVS_URL);
    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(
      "/v2/acts/streamers~youtube-video-downloader/run-sync-get-dataset-items",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    // `videos` is the documented streamers-actor input field; we
    // also send `videoUrls` for other downloader actors that use
    // that key. Both should carry the watch URL.
    expect(body.videos).toEqual(["https://www.youtube.com/shorts/abc"]);
    expect(body.videoUrls).toEqual(["https://www.youtube.com/shorts/abc"]);
    // 480p quality cap to keep the per-MB download bill down -
    // Deepgram only needs the audio.
    expect(body.preferredQuality).toBe("480p");
  });

  it("returns null when the dataset is empty (private / age-gated / pulled)", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const d = new ApifyYoutubeDownloader({
      apiKey: "k",
      actorId: "streamers~youtube-video-downloader",
      fetchImpl,
    });
    expect(
      await d.fetchMediaUrl("https://www.youtube.com/shorts/missing"),
    ).toBeNull();
  });

  it("throws on a non-2xx response so the worker can record a real failure", async () => {
    const fetchImpl = makeFetch(async () =>
      new Response("nope", { status: 429 }),
    );
    const d = new ApifyYoutubeDownloader({
      apiKey: "k",
      actorId: "streamers~youtube-video-downloader",
      fetchImpl,
    });
    await expect(
      d.fetchMediaUrl("https://www.youtube.com/shorts/x"),
    ).rejects.toThrow(/429/);
  });
});

describe("parseDownloaderItem", () => {
  it("prefers a top-level videoFile (Apify KVS link)", () => {
    expect(parseDownloaderItem({ videoFile: KVS_URL })).toBe(KVS_URL);
  });

  it("falls back to mediaUrls[0]", () => {
    expect(
      parseDownloaderItem({ mediaUrls: ["https://x.com/y.mp4"] }),
    ).toBe("https://x.com/y.mp4");
  });

  it("tolerates videoUrl alias", () => {
    expect(parseDownloaderItem({ videoUrl: "https://x.com/y.mp4" })).toBe(
      "https://x.com/y.mp4",
    );
  });

  it("returns null for shapes with no recognisable URL field", () => {
    expect(parseDownloaderItem({ title: "no url" })).toBeNull();
    expect(parseDownloaderItem(null)).toBeNull();
    expect(parseDownloaderItem("nope")).toBeNull();
  });
});
