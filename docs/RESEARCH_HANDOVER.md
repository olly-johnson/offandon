# Research Feature — Handover

**Branch:** `feature/research-analyze` · **PR:** #59 · **Last commit at handover:** `782549c`

/ Pick up with: `git checkout feature/research-analyze && git pull`

---

## What this feature is

A 4-step competitor-research surface on `/research`, multi-platform across
Instagram, TikTok, and YouTube Shorts:

1. **Customise Your Feed** — track up to 5 creators (suggested-creator chips +
   manual handle entry + platform picker). Auto-syncs on add.
2. **Find Outlier Videos** — cross-channel grid of reels that beat their own
   channel's median view count. URL-driven filter chips (outlier ratio, time
   window, min views, platform).
3. **Understand Why They Went Viral** — per-reel drill-in at
   `/research/[competitorId]/[mediaId]` with tabbed analysis (Action / Metrics
   / Transcript / Description / Hook / Structure).
4. **Write Winning Scripts** — a Vault (saved competitor analyses as
   `client_assets[past_script]`) feeding the existing `/scripts` generator.

Pipeline per platform: Apify scrape → parse → (YT only: download mp3) →
Deepgram transcript → Sonnet structural analysis → `competitor_media_analysis`
row → realtime UI update.

## State of play

- 576 tests pass; tsc + lint clean (one pre-existing unrelated warning in
  `scripts/migrate-singapore.mjs`).
- IG: working end-to-end.
- TikTok: working end-to-end (after `shouldDownloadVideos: true` → KVS URL fix).
- **YouTube: NOT working yet — this is the active problem. See below.**

## ⚠️ ACTIVE ISSUE: YouTube analysis fails

YT uses a 2-step pipeline because the list scraper only returns watch-page URLs
(HTML), not transcribable mp4s:

1. `streamers~youtube-scraper` lists shorts → rows land with `media_url = null`
2. `download-youtube-media` Inngest fn calls `streamers~youtube-video-downloader`
   → resolves a stable mp3 URL → writes `media_url` → re-emits analyse event
3. Normal Deepgram + Sonnet path runs

**Symptoms seen:** some reels fail "no mp4 URL returned"; others hung
"analysing"; earlier a `402 actor-memory-limit-exceeded` (free tier 8 GB cap).

**The operator just upgraded Apify free → Starter ($49/mo, 32 GB).** That likely
clears the 402s. Now the conservative limits we set for the free tier are
probably over-tight and can be relaxed:

- `src/engines/competitor/youtube-downloader.ts`: `DEFAULT_MEMORY_MB = 2048`
  (the `?memory=` override). Can likely go back to the actor default (4096) now.
- `src/lib/shared/inngest/functions/download-youtube-media.ts`:
  `concurrency: { limit: 2 }`. Can bump to 4+ on Starter.

**First debugging move for the next agent:** run the downloader actor once in the
Apify console with a real short URL, inspect the dataset JSON, and confirm the
output field matches `parseDownloaderItem` in `youtube-downloader.ts` (currently
tries `videoFile` → `videoUrl` → `mediaUrl` → `mediaUrls[0]`). The actor input
we send is `{ videos: [{ url }], preferredFormat: "mp3", preferredQuality:
"360p", storeInKVStore: true }` — verify that matches the actor's current schema.
If the output URL is on a different key, extend the parser (it's pure + unit
tested in `youtube-downloader.test.ts`).

Some YT failures are legitimate (age-gated / private / members-only) and can't
be fixed — those correctly land on `analysis_failed_reason`.

## Migrations that MUST be applied to Supabase (not auto-applied)

Run these in the Supabase SQL editor before anything works in prod. Files are in
`supabase/migrations/`:

1. `20260522000000_widen_performance_score.sql` — reach score 0-10 → 0-100
2. `20260522000001_suggested_avatars_bucket.sql` — public storage bucket for
   suggested-creator avatars
3. `20260523000000_competitor_accounts_platform.sql` — adds `platform` column +
   widens uniqueness to `(user_id, platform, username)`
4. `20260527000000_competitor_thumbnails_bucket.sql` — public bucket for cached
   TikTok reel covers (their signed CDN URLs expire within hours)

The hand-rolled types in `src/lib/shared/supabase/types.ts` already include the
`platform` column, so code compiles against the post-migration schema.

## Key files

- `src/engines/competitor/platform-scraper.ts` — per-platform actor dispatch +
  parsers (`buildScrapeRequest`, `parseScrapeItem`). Add a 4th platform here.
- `src/engines/competitor/youtube-downloader.ts` — YT mp3 resolver.
- `src/engines/competitor/outlier-feed.ts` — pure `computeOutliers` + DB wrapper.
- `src/engines/competitor/vault.ts` — Step-4 vault save/list/remove.
- `src/lib/shared/inngest/functions/scrape-competitor.ts` — scrape + two-batch
  fan-out (latest 5 first, rest after a grace sleep).
- `src/lib/shared/inngest/functions/download-youtube-media.ts` — YT step 1.
- `src/lib/shared/inngest/functions/analyze-competitor-media.ts` — Deepgram +
  Sonnet (shared by all platforms).
- `src/app/(app)/research/*` — all UI. `reel-thumbnail.tsx` is the YT-thumbnail
  fallback-chain wrapper.

## Env (defaults work; override only to swap actors)

```
APIFY_ACTOR_ID=apify~instagram-reel-scraper
APIFY_INSTAGRAM_PROFILE_ACTOR_ID=apify~instagram-profile-scraper
APIFY_TIKTOK_ACTOR_ID=clockworks~tiktok-scraper
APIFY_YOUTUBE_ACTOR_ID=streamers~youtube-scraper
APIFY_YOUTUBE_DOWNLOADER_ACTOR_ID=streamers~youtube-video-downloader
APIFY_YOUTUBE_DOWNLOADER_MEMORY_MB=2048
```

Also requires `APIFY_API_KEY`, `APIFY_WEBHOOK_SECRET`, `DEEPGRAM_API_KEY`,
`ANTHROPIC_API_KEY`, and (prod) the Inngest cloud keys.

## Open threads (not started)

1. **No per-user spend cap.** A heavy user clicking "Tap to analyse" on many old
   reels could run up real API cost. `RESEARCH_ANALYSIS_MAX_PER_30D` exists for
   the IG-library analyser (BO-043) but is NOT wired into the competitor
   analyser. Worth porting before real users.
2. **mp3-converter actor swap** — if the streamers downloader stays flaky, a
   dedicated YT-mp3 actor may be faster/cheaper. Swap via
   `APIFY_YOUTUBE_DOWNLOADER_ACTOR_ID`; the parser tolerates common field names.
3. **TT/YT avatars + follower counts** — the suggested-avatar refresh + profile
   sync are Instagram-only. The chips for TT/YT fall back to gradient initials.
4. **Cost model** (rough, post-cold-start): ~$1.50/creator/month steady state.
   25 creators ≈ $80/mo all-in; 50 creators ≈ $130/mo. Sonnet is ~60% of
   variable cost — consider Haiku for old-reel batch jobs.

## Workflow constraints (from CLAUDE.md / project rules)

- Never commit to `main`. All work via PRs from feature branches.
- TDD: write the failing `.test.ts` before logic.
- No em-dashes in user-facing source (there's a lint gate:
  `src/lib/shared/ui-source-anti-slop.test.ts`). Use hyphens/commas.
- Match Vercel's existing env var names exactly (`APIFY_API_KEY`, not `_TOKEN`).
