/**
 * Hand-picked Instagram creators surfaced as one-click "track this"
 * chips on the Research page. Aimed at the solo-founder / creator-
 * economy operator audience Bot OS serves; tilt the list toward
 * account types our users would actually want to study (frameworks,
 * business storytelling, productized expertise) rather than mass-
 * appeal celebrity feeds.
 *
 * Follower counts are an approximate snapshot, not a live read. We
 * don't have an IG profile API in the request path, and a real-time
 * fetch per chip would burn Apify credits on every page load. If a
 * count drifts past usefulness, just update it here.
 */

export interface SuggestedCreator {
  /** IG handle, no '@' prefix. Lowercase by convention but matched case-insensitively. */
  handle: string;
  /** Approximate follower count at curation time. Display only. */
  follower_count: number;
  /** One-line note shown in the tooltip. Optional. */
  bio?: string;
}

export const SUGGESTED_CREATORS: SuggestedCreator[] = [
  {
    handle: "alexhormozi",
    follower_count: 4_100_000,
    bio: "Acquisition.com - frameworks, offers, scale",
  },
  {
    handle: "garyvee",
    follower_count: 11_300_000,
    bio: "VaynerMedia - content velocity, business punditry",
  },
  {
    handle: "leilahormozi",
    follower_count: 1_400_000,
    bio: "Operator content, hiring + culture frameworks",
  },
  {
    handle: "danielpriestley",
    follower_count: 380_000,
    bio: "Key Person of Influence, founder positioning",
  },
  {
    handle: "imangadzhi",
    follower_count: 1_200_000,
    bio: "Agency Navigator, entrepreneurship",
  },
  {
    handle: "ali.abdaal",
    follower_count: 1_700_000,
    bio: "Productivity + creator-economy operator",
  },
  {
    handle: "chris.do",
    follower_count: 480_000,
    bio: "The Futur - creative business pricing + sales",
  },
  {
    handle: "thedankoe",
    follower_count: 350_000,
    bio: "One-Person Business, modern wisdom",
  },
  {
    handle: "nealoshea",
    follower_count: 220_000,
    bio: "Founder content + storytelling",
  },
];
