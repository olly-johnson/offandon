/**
 * Hand-picked creators surfaced as one-click "track this" chips on
 * the Research page. Mixed across Instagram and TikTok; tilted toward
 * operator-economy / founder content the Bot OS audience would
 * actually want to study.
 *
 * YouTube Shorts is temporarily disabled on the surface (the analysis
 * pipeline isn't reliable yet). The backend scrapers, downloader, and
 * DB domain still understand 'youtube_shorts', so re-enabling is just
 * a matter of adding the chips back here and to SUPPORTED_TRACKING_-
 * PLATFORMS plus the two platform pickers.
 *
 * Follower / subscriber counts are an approximate snapshot, not a
 * live read. We don't have a live profile API in the request path,
 * and a per-chip fetch would burn Apify credits on every page load.
 * Edit the numbers here when they drift past usefulness.
 *
 * Avatar URLs resolve to Supabase Storage (bucket: suggested-avatars,
 * filename: <handle>.webp). Missing avatars 404 cleanly and the chip
 * falls back to a deterministic gradient initial, so the data ships
 * before the bucket is populated. Refresh the bucket via Studio
 * (drag-drop) when a creator changes their profile picture.
 */

export type SuggestedPlatform = "instagram" | "tiktok" | "youtube_shorts";

export interface SuggestedCreator {
  /** Handle on the platform, no '@' prefix. Lowercase by convention. */
  handle: string;
  platform: SuggestedPlatform;
  /** Approximate followers (IG/TT) or subscribers (YT) at curation time. */
  follower_count: number;
  /** One-line note shown in the tooltip. Optional. */
  bio?: string;
}

export const SUGGESTED_CREATORS: SuggestedCreator[] = [
  // Instagram - operator + creator-business
  {
    handle: "hormozi",
    platform: "instagram",
    follower_count: 4_100_000,
    bio: "Acquisition.com - frameworks, offers, scale",
  },
  {
    handle: "leilahormozi",
    platform: "instagram",
    follower_count: 1_400_000,
    bio: "Operator content, hiring + culture frameworks",
  },
  {
    handle: "danielpriestley",
    platform: "instagram",
    follower_count: 380_000,
    bio: "Key Person of Influence, founder positioning",
  },
  // TikTok - business storytelling + creator-economy
  {
    handle: "garyvee",
    platform: "tiktok",
    follower_count: 14_900_000,
    bio: "VaynerMedia - content velocity, business punditry",
  },
  {
    handle: "codiesanchez",
    platform: "tiktok",
    follower_count: 1_100_000,
    bio: "Contrarian Thinking - acquisitions + ownership",
  },
  {
    handle: "shaanvp",
    platform: "tiktok",
    follower_count: 340_000,
    bio: "My First Million - founder anecdotes",
  },
];

// YouTube Shorts is intentionally absent while its analysis pipeline is
// disabled. Add "youtube_shorts" back here to re-enable the platform.
export const SUPPORTED_TRACKING_PLATFORMS: ReadonlySet<SuggestedPlatform> =
  new Set(["instagram", "tiktok"]);

/**
 * Returns the Supabase Storage URL for a creator's cached avatar.
 * Falls through to a 404 if the bucket file does not exist; the
 * chip's <Image> onError handler swaps in the gradient placeholder.
 */
export function suggestedAvatarUrl(handle: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/suggested-avatars/${handle.toLowerCase()}.webp`;
}
