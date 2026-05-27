/**
 * scripts/refresh-suggested-avatars.ts
 *
 * Populate / refresh the cached avatars for the curated
 * SUGGESTED_CREATORS chips on /research, on demand, without waiting for
 * the weekly Inngest cron. Resolves each profile's avatar via Apify,
 * downloads the bytes, and uploads them to the public suggested-avatars
 * bucket (keyed `<handle>.webp`). Idempotent: re-running overwrites.
 *
 * Usage:
 *   npm run avatars:refresh                 # all IG + TikTok creators
 *   npm run avatars:refresh -- --platform=tiktok
 *   npm run avatars:refresh -- --handle=garyvee
 *
 * Requires (in .env.local): NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, APIFY_API_KEY. The suggested-avatars
 * bucket migration (20260522000001) must already be applied.
 */

import { createClient } from "@supabase/supabase-js";

import { SUGGESTED_CREATORS } from "@/app/(app)/research/suggested-creators";
import { ApifyProfileScraper } from "@/engines/competitor/profile-scraper";
import {
  cacheSuggestedAvatar,
  SUGGESTED_AVATARS_BUCKET,
} from "@/engines/competitor/suggested-avatar-cache";
import type { Database } from "@/lib/shared/supabase";

import { loadEnvLocal } from "./_env";

function parseArgs(argv: string[]): { platform?: string; handle?: string } {
  const args = new Map<string, string | true>();
  for (const part of argv.slice(2)) {
    if (!part.startsWith("--")) continue;
    const [k, v] = part.slice(2).split("=", 2);
    args.set(k, v ?? true);
  }
  const platform = args.get("platform");
  const handle = args.get("handle");
  return {
    platform: typeof platform === "string" ? platform : undefined,
    handle: typeof handle === "string" ? handle.toLowerCase() : undefined,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { platform, handle } = parseArgs(process.argv);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    console.error("set them in .env.local before running this script");
    process.exit(1);
  }
  if (!process.env.APIFY_API_KEY) {
    console.error("missing APIFY_API_KEY (set it in .env.local)");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, serviceKey);
  const scraper = ApifyProfileScraper.fromEnv();
  const storage = supabase.storage.from(SUGGESTED_AVATARS_BUCKET);

  // YouTube is excluded (surface disabled); narrow further by the
  // optional --platform / --handle filters.
  const targets = SUGGESTED_CREATORS.filter((c) => {
    if (c.platform === "youtube_shorts") return false;
    if (platform && c.platform !== platform) return false;
    if (handle && c.handle.toLowerCase() !== handle) return false;
    return true;
  });

  if (targets.length === 0) {
    console.error("no matching suggested creators for the given filters");
    process.exit(1);
  }

  console.log(`refreshing ${targets.length} avatar(s)...`);
  let ok = 0;
  let missing = 0;
  let failed = 0;
  for (const creator of targets) {
    const outcome = await cacheSuggestedAvatar({ creator, scraper, storage });
    console.log(`  ${creator.platform}/${creator.handle}: ${outcome}`);
    if (outcome === "uploaded") ok++;
    else if (outcome === "missing") missing++;
    else failed++;
  }

  console.log(`done. uploaded=${ok} missing=${missing} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
