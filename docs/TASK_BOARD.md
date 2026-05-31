# Task Board - Bot OS MVP

Single source of truth for in-flight and completed work. Update when starting a task (status → In Progress) and when finishing (status → Done with PR ref). Stale board = workflow bug.

## Phase 0. Foundations

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-001 | Infra: Next 16 + Onyx theme + Vitest workspace | claude | Done | PR #1 |
| BO-002 | Data: Supabase schema + RLS + GDPR delete | claude | Done | PR #1 |
| BO-003 | Engine: Voice DNA questionnaire logic (TDD) | claude | Done | PR #2 |
| BO-006 | Persistence: voice_dna table + replace_voice_dna RPC + typed clients | claude | Done | PR #3 |

## Phase 1. Auth + Onboarding

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-007 | Shared logger (`src/lib/shared/logger.ts`) | claude | Done | PR #4 |
| BO-008 | Auth foundation: middleware, /signin, /auth/callback, /auth/confirm, /onboarding/set-password | claude | Done | PR #4 |
| BO-009 | Onboarding wizard (3-step, multi-field) + profile creation | claude | Done | PR #4 |
| BO-010 | Anthropic SDK wired behind ILLMClient (Claude 4.6 Sonnet, prompt caching) | claude | Done | PR #4 |
| BO-011 | Dashboard stub (post-onboarding landing) | claude | Done | PR #4 |
| BO-012 | Admin invite route stub (programmatic invite TODO) | claude | Done | PR #4 |
| BO-004 | API: Claude 4.6 + anti-slop filter | claude | Done | PR #2 (anti-slop), PR #4 (SDK) |
| BO-061 | Password reset: "Forgot password?" on /signin → /auth/forgot-password → Supabase recovery email → /auth/reset-password. In-app /settings page with current-password-verified change-password form; sidebar Settings button now links here. `/auth/confirm` routes `type=recovery` to /auth/reset-password by default. | claude | In Progress | feature/password-reset |

## Phase 2. Content engine

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-017 | Migration: script_batches table + scripts.batch_id + delete_user_data update | claude | Done | PR #5 |
| BO-018 | Service-role Supabase admin client | claude | Done | PR #5 |
| BO-019 | Content engine: ScriptGenerator + system prompt + anti-slop | claude | Done | PR #5 |
| BO-020 | Content engine: persistence (createScriptBatch, saveGeneratedScripts, listBatches, getBatch, updateBatchStatus) | claude | Done | PR #5 |
| BO-021 | Inngest: client + generate-scripts function + /api/inngest serve route | claude | Done | PR #5 |
| BO-022 | /scripts UI: list page + detail page + GenerateButton + auto-refresh | claude | Done | PR #5 |
| BO-023 | Dashboard: link to /scripts + recent batch summary | claude | Done | PR #5 |
| BO-024 | service_role grant backfill on Phase 0 tables (migration 20260509000002) | claude | Done | PR #5 |
| BO-025 | Inngest catch-path: don't shadow original error if mark-failed itself fails | claude | Done | PR #5 |

## Phase 3. Chat surface

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-029 | Migration: conversations + messages + delete_user_data update + service_role grants | claude | Done | PR #6 |
| BO-030 | Chat engine: types + system-prompt + ChatEngine + IChatLLMClient + tests | claude | Done | PR #6 |
| BO-031 | Chat persistence: createConversation, listConversationsForUser, getConversationWithMessages, appendMessage | claude | Done | PR #6 |
| BO-032 | /chat list + /chat/[id] thread + send/start server actions + dashboard link | claude | Done | PR #6 |

## Phase 4. Personalization (planned)

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-034 | User Memory: post-chat Haiku extractor writes structured facts to `user_memories`. Injected into chat + scripts system prompts. Learns iteratively. | claude | Done | PR #21 |
| BO-035 | "Save that as an idea" — Chat `save_idea` tool-use, `ideas` table, Ideas Bank tab on /scripts, Pocket page. | claude | Done | PR #20 |
| BO-036 | Methodology layer: per-user evergreen principles editable on /methodology. Persisted in `user_methodology`. Injected into chat + scripts system prompts. | claude | Done | PR #22 |
| BO-037 | Methodology layer: load `docs/methodology/01-house.md` + per-surface slice into chat + scripts system prompts (analyst will follow when the engine exists). | claude | Done | PR #10 |
| BO-038 | Onboarding refresh: add ICP expansion (2am thoughts, internal battles, dreams), story bank seeds, contrarian belief, signature phrases, example creators. See `docs/methodology/05-onboarding-updates.md`. | claude | Done | PR #9 |
| BO-039 | Methodology validators: extend anti-slop with structural checks (SCCCC ≥ 3/5 on hooks, ≥ 3 Connection Points per script, word count gate). Wire into ScriptGenerator pre-submission gate. | - | Deferred | revisit if outputs degrade (short bodies, weak hooks, missing Connection Points across batches) |

## Phase 1. Pending

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-005 | Social: Instagram OAuth (Path A) + content library + follower/reach dashboard + nightly Inngest sync | claude | Done | PR #26 |

## Phase 1. Follow-ups discovered during smoke-testing

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-013 | Programmatic admin invite endpoint (replaces dashboard invite) + admin-only sidebar entry | claude | Done | PR #27 |
| BO-062 | Brand dashboard redesign (8-metric strip, engagement chart, performance tabs, top content, funnel/story/identity cards) wired to real IG data with N/A placeholders. Follower-history table so New Followers can populate. Insights fix: request `views` not deprecated `plays` (a single bad metric 400s the whole /insights call, which is why reach/views/saves/shares all showed N/A), and log swallowed insights errors instead of silently nulling. Header avatar: store `ig_profile_picture_url` on the connection (fetched from /me, refreshed each sync) and show it in place of the initial, falling back to the initial when null/expired. Chart polish: axis labels rendered as crisp HTML overlay instead of stretched SVG text. | claude | In Progress | feature/dashboard-brand-redesign |
| BO-014 | Custom email templates (invite, reset, magic link) with branded copy | claude | Partial | PR #29 (invite done; reset + magic-link pending) |
| BO-015 | Surface `error` query param on /signin (callback failures, expired links) | - | Todo | - |
| BO-016 | unwrapSupabaseError helper for the empty-error-on-401 wart | - | Todo | - |
| BO-026 | Stuck-batch sweeper (cron: mark batches stuck > 5 min as failed) | - | Todo | - |
| BO-027 | "Cancel batch" button on /scripts to manually clear stuck rows | - | Todo | - |
| BO-028 | Document the "auto-expose new tables = OFF" Supabase setting in CLAUDE.md so future tables remember to grant service_role | - | Todo | - |
| BO-040 | Auth refresh-token race: detect `refresh_token_already_used` / `refresh_token_not_found` in middleware, clear dead Supabase auth cookies on the response, downgrade noisy log to debug. | claude | Done | PR #12 |
| BO-042 | Operator-driven client ingestion: read `clients/<slug>/` files, LLM-extract into `voice_dna` + `client_assets` + `user_memories` + `user_methodology`. Two CLI commands (extract → review → commit) + em-dash sanitizer + ScriptGenerator wired to load client_assets at runtime. Bypass wizard when voice_dna already populated. | claude | Done | PR #31 |
| BO-043 | Instagram video analysis: Deepgram transcribe + Sonnet structural analysis for each video in the user's library. Inline button on `/library`, results saved to `instagram_media_analysis`, "Save as reference" promotes a winner to `client_assets[past_script]` (consumed by ScriptGenerator). Per-user rolling-30d rate limit. | claude | In Progress | feature/instagram-video-analysis |
| BO-044 | Chat output: strip markdown bold (`**`), ATX headings, and `---` separators from LLM replies before display + tighten chat system prompt to forbid them. Renderer uses a `<pre>` block so markers leaked through raw. | claude | Done | PR #37 |
| BO-045 | Chat input: auto-grow message textarea to its content (caps at `max-h-48` then scrolls), resets to one row after submit. Wrapped in shared `AutoGrowTextarea`. | claude | Done | PR #38 |
| BO-046 | Admin overview page (`/admin`): metric cards (clients/scripts/chats/messages) + per-client health table (last sign-in, scripts, chats, messages). Service-role queries in `src/engines/admin/stats.ts`. Token spend deferred until API usage logging exists. | claude | Done | PR #39 |
| BO-047 | API usage tracking: `api_usage` table + service-role logger (`recordApiUsage`) + `onUsage` callback on `AnthropicLLMClient`. Wired into chat, voice DNA, memory extract, script gen, IMF, hooks, single-script, media analysis. Surfaced on `/admin` as 30d spend / per-surface / per-client cost. Pricing hardcoded in `src/engines/admin/usage.ts`; update when Anthropic re-prices. | claude | Done | PR #40 |
| BO-048 | Master Bot for methodology edits: `/admin/master-bot` chat with tool-use over `methodology_rules` (Layer 1 one-liners) + `house_methodology` (Layer 2 slice content) + `house_methodology_proposals` (Apply/Discard flow). Engines load methodology from DB-or-file via `loadMethodologySlice` so admin edits propagate live to chat / scripts / IMF / hooks / single-script. | claude | In Progress | feature/master-bot |

## Phase 5. Client corpus (Tier-2 retrieval)

Two-tier client information model: Tier 1 (voice_dna, methodology, memories, client_assets) stays in the system prompt; Tier 2 (long-form raw artifacts — Fathom transcripts, weekly questionnaires, notes) is chunked + embedded + retrieved on demand. Solves the "we want to keep adding info per client without bloating the prompt" growth path.

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-049 | Foundation: `pgvector` + `client_documents` + `client_document_chunks` + HNSW + `match_client_chunks` RPC. Embeddings client (Voyage `voyage-3`, 1024-d) + chunker (~800 tokens, 100 overlap). Corpus engine: `saveClientDocument`, `replaceDocumentChunks`, `searchClientCorpus`, `formatCorpusHits`. | claude | Done | PR #43 |
| BO-050 | Chat: register `search_client_corpus` tool in chat-engine, handle tool_use loop, tighten system prompt with retrieval nudge. | claude | Done | PR #47 |
| BO-051 | Script generator: implicit retrieval at gen start (embed seed prompt → top-k chunks injected into system prompt). Additive to existing `client_assets` loader. | claude | Done | PR #45 |
| BO-052 | Ingestion: walk every text-shaped file under `clients/<slug>/` recursively (transcripts, questionnaires, notes, scripts, voice profile, story bank, all root-level operator files) — chunk → embed → write to `client_documents` / `client_document_chunks`. Watermark by file mtime so weekly drops don't re-process the world. New `npm run ingest:corpus`. | claude | Done | PR #46 |
| BO-053 | Past-script framework labels (lean). Deterministic parser for `clients/<slug>/scripts/**/*.md` reads `Framework:` frontmatter into `metadata.framework`. Batch system prompt labels each past_script `[framework: X]` so the model has a structural anchor for the framework it picks per script. Replaces #48 which over-engineered round-robin grouping. | claude | In Progress | feature/scripts-parser-and-labels |
| BO-054 | Similarity-based past_script retrieval for the single-script wizard. Embed the chosen hook + concept + IMF, similarity-search past_scripts, inject top 2 as structural anchors. Requires a `match_client_documents` RPC that returns whole documents by chunk-level max similarity (today's `match_client_chunks` only returns chunks). | - | Todo | - |
| BO-055 | Script library: delete action. `deleteScriptForUser` persistence helper (scoped to id+user_id), `deleteScriptAction` server action, inline two-stage confirm + trash icon on each library row. Vitest covers the helper. | claude | Done | PR #50 |
| BO-056 | Funnel-chart wiring fix. Migration adds `scripts.angle` + `scripts.pillar` (nullable, angle check-constrained). `saveGeneratedScripts` and `saveSingleScript` persist them; `saveScriptToLibraryAction` + the wizard pass through. Dashboard selects them and stops hardcoding `angle: null`. Wizard-saved scripts now count toward the Trust Funnel Balance + pillar charts. | claude | In Progress | feature/funnel-chart-wiring |

## Phase 6. Weekly check-in loop

Weekly cadence that keeps the Voice DNA "fresh." Friday 09:00 Bali (UTC+8) the cohort gets emailed a Google Forms questionnaire; Saturday 09:00 Bali stragglers get a reminder. Apps Script attached to the form POSTs responses to `/api/weekly-checkin/webhook` (HMAC verified); the webhook persists to `weekly_checkins` and emits `voice/dna.refresh.requested`. The handler folds accumulated weekly answers into the user's onboarding shape and regenerates the active `voice_dna` row, so next week's scripts are written off this week's reality.

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-057 | Migration: `weekly_checkins(user_id, week_start, raw_responses jsonb, submitted_at)` + uniqueness on (user_id, week_start) + RLS (select-own only, writes are service-role) + `delete_user_data` updated. Database types updated. | claude | In Progress | feature/weekly-checkin |
| BO-058 | Email infra: `IEmailClient` + `ResendEmailClient` (no SDK; direct fetch) + `DryRunEmailClient` for unset-key envs. `buildWeeklySendEmail` / `buildWeeklyReminderEmail` templates, anti-slop clean. `isoWeekStart` helper (Monday-anchored, UTC). | claude | In Progress | feature/weekly-checkin |
| BO-059 | Inngest crons: `weekly-checkin-send` (cron `0 1 * * 5` = Fri 09:00 Bali) blasts the full cohort; `weekly-checkin-reminder` (cron `0 1 * * 6`) blasts only users without a `weekly_checkins` row for the current `week_start`. Apps Script template at `examples/google_form_webhook.gs`. | claude | In Progress | feature/weekly-checkin |
| BO-060 | Webhook + voice refresh: `/api/weekly-checkin/webhook` verifies HMAC-SHA256 against `WEEKLY_CHECKIN_WEBHOOK_SECRET`, resolves user by email, persists check-in idempotently (23505 → 200), emits `voice/dna.refresh.requested`. Handler folds weeklies into `what_works` + `where_stuck` and rewrites the active `voice_dna` via a service-role replace (RPC's SECURITY INVOKER can't be reached from Inngest). | claude | In Progress | feature/weekly-checkin |

## Phase 7. Research (competitor tracking + hook bank)

Per-user "track up to 5 IG accounts" research surface. The user pins competitors on `/research`; a future scraper pulls their videos, transcribes them, runs structural analysis, and folds winning hooks/formats/topics back into `user_methodology` so chat and scripts pick them up. BO-061 is the foundation (table + UI + add/remove); the scraper, analysis, and methodology feedback land in BO-062..BO-064.

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-061 | Foundation: `competitor_accounts` table + RLS + grants + `delete_user_data` update. Engine `src/engines/competitor/*` with `addCompetitor`/`listCompetitors`/`removeCompetitor`, 5-account cap, handle normalisation + validation. `/research` page replaces the ComingSoon stub: tracked-accounts list, add-handle form, remove button. Sidebar unlocked. Vitest covers the persistence. | claude | In Progress | feature/research-competitors |
| BO-062 | Apify scraping integration. `competitor_media` table + RLS + `delete_user_data` updated. `ApifyCompetitorScraper` (reads `APIFY_API_KEY`, default actor `apify~instagram-reel-scraper`) wraps `/v2/acts/.../runs` + dataset fetch; webhook config injects `X-Apify-Webhook-Token` + custom payload template. `/api/apify/webhook` verifies the token then emits `competitor/scrape.completed`. Two Inngest functions: `competitor-scrape-requested` (starts the run) and `competitor-scrape-completed` (ingests dataset -> upsert `competitor_media`). "Sync now" button on each `/research` row + sync state badge. Vitest covers scraper, webhook, media persistence. | claude | In Progress | feature/research-scraping |
| BO-063 | Per-video analysis. `competitor_media_analysis` table (mirrors `instagram_media_analysis`) + RLS + realtime + `delete_user_data`. `analyze-competitor-media` Inngest function reuses Deepgram + `MediaAnalyzer` against each reel; library stats are computed from the competitor's own view-count distribution. Auto fan-out from `competitor-scrape-completed` covers only the **latest 5** reels per sync; older reels surface an explicit "Analyse" button on the drill-in. Nightly cron `sync-all-competitors-nightly` (04:00 UTC) fires `competitor/scrape.requested` for every tracked account. `competitor_media.analysis_pending` + `analysis_failed_reason` columns surface in-flight / failed states so the UI never gets stuck on an infinite spinner. Main `/research` page now renders a 5-reel preview strip beneath each tracked competitor (thumbnail + perf badge / pending / failed / idle). New `competitor_analysis` surface added to `api_usage` for /admin spend tracking. | claude | In Progress | feature/research-analyze |
| BO-064 | Methodology feedback. Surface a "promote to methodology" action on each winning hook/format; persists the rule into `user_methodology` so chat + script prompts pick it up automatically. UI for the hook bank lives on `/research`. | - | Todo | - |
| BO-065 | Disable YouTube Shorts on the surface for launch. YT analysis (2-step downloader -> Deepgram) isn't reliable yet, so it's removed from the suggested-creator chips, the add-competitor platform picker, the outlier-feed platform filter, and the page's allowed-platform parse. `addCompetitorAction` validates against `SUPPORTED_TRACKING_PLATFORMS` so a crafted post can't add a YT account. Backend (scraper dispatch, `youtube-downloader`, `download-youtube-media` Inngest fn, `youtube_shorts` in `CompetitorPlatform`/DB CHECK) is left dormant; re-enabling is reverting the surface edits. Vitest updated to assert YT is no longer offered. | claude | In Progress | feature/research-analyze |
| BO-066 | Research launch bug-fixes. (1) Outlier feed tile now badges each reel's actual platform glyph instead of a hardcoded Instagram icon (`OutlierFeedItem.platform` threaded through `computeOutliers`). (2) Removing a tracked competitor is now optimistic: a realtime `router.refresh()` could re-paint the just-deleted row from a stale RSC snapshot, so it took two clicks; the row is now hidden client-side instantly via a transition while the server action does the real delete. (3) TikTok thumbnails: covers are short-lived signed CDN URLs that expire within hours, blanking the tiles. New `competitor-thumbnails` public bucket + `cacheReelThumbnails` engine copies each TikTok cover into our storage at scrape time (URL still fresh) and rewrites `thumbnail_url` to the stable public URL; falls back to the source URL on failure and self-heals next sync. IG (optimizer) and YT (disabled) untouched. Migration `20260527000000_competitor_thumbnails_bucket.sql`. (4) Tracking a creator is now optimistic too: pressing Track drops a placeholder "Syncing..." card on the watchlist instantly via a new pure `mergeWatchlist` helper (`src/app/(app)/research/watchlist.ts`, deduped by platform+handle), handed off to the real row on revalidation and rolled back if the server rejects it. (5) Raised the shared per-user analysis cap (`RESEARCH_ANALYSIS_DEFAULT_MAX_PER_30D`) 100 -> 400. It governs both /library and competitor analysis via one rolling-30d budget, and competitor sync auto-analyses 30 reels x up to 5 creators (150), so 100 blocked the feature's own normal usage. Still env-overridable via `RESEARCH_ANALYSIS_MAX_PER_30D`. | claude | In Progress | feature/research-analyze |
| BO-067 | TikTok suggested-creator avatars. `ApifyProfileScraper` gains `fetchTiktokAvatarUrl` (probes the clockworks actor for one result, reads `authorMeta.avatar` with size-variant fallback) + a platform-routing `fetchAvatarUrl`. The fetch/download/upload path is extracted into a tested `cacheSuggestedAvatar` engine module shared by the weekly `refresh-suggested-avatars` Inngest cron (now IG + TikTok, YT skipped) and a new on-demand `npm run avatars:refresh` script (`--platform` / `--handle` filters). Avatars land in the `suggested-avatars` bucket as `<handle>.webp`. | claude | In Progress | feature/research-analyze |
| BO-069 | Wire the dashboard Competitors card to real data. The card was a hardcoded "No competitors added yet" placeholder, so accounts tracked on `/research` never showed up. New pure `summariseCompetitors` (`src/app/(app)/dashboard/competitors.ts`, Vitest-covered) shapes `competitor_accounts` rows (via `listCompetitors`) into a view model with a per-account sync status (syncing / failed / synced / never) and a relative "Synced Xh ago" label. The card lists each tracked handle + platform + status dot with an "n/5 tracked" count and a Manage in Research link, keeping the empty state only when there genuinely are none. | claude | In Progress | fix/dashboard-competitors-card |
| BO-068 | Formula Matrix on the dashboard. Replaces the placeholder `FormulaMatrixCard` stub with a live card. New pure `buildFormulaMatrix` (`src/lib/shared/formula-matrix.ts`, Vitest-covered) ranks format / topic / hook independently across the creator's own analysed library (`instagram_media_analysis`) plus the reels of tracked competitors (`competitor_media_analysis`), blending each row's reach percentile (`performance_score`) with a per-channel trending-outlier ratio (`view_count` / channel median, the same baseline the outlier feed uses), then combines the winner of each dimension into one suggested video formula. Hooks are surfaced as verbatim exemplars (no taxonomy to group on). Server loader `formula-matrix-data.ts` joins the media + analysis tables and computes per-competitor medians; the card shows the combined formula plus three ranked dimension lists with source attribution (You / competitors). | claude | In Progress | feature/research-analyze |
| BO-070 | Outlier-to-ideas remix. Changes what "Save to vault" leads to: instead of saved competitor reels leaking into the weekly script generator as `past_script` references, the `loadScriptAssetsContext` past_script loader now excludes `source_file ILIKE 'competitor:%'`, and each saved reel gets a per-video "Generate 3 ideas" button in the Step 4 vault. New `OutlierIdeaGenerator` engine (+ `outlier-idea-system-prompt`) studies one outlier's hook/topic/structure pattern and writes 3 ideas in the creator's own voice about their own stories (never the competitor's content), validated against pillars + anti-slop. Inline server action `generateIdeasFromOutlierAction` (mirrors the Script Wizard's inline LLM pattern, usage surface `script`) saves them to the Ideas Bank with new source `'research'` (migration `20260528000000_ideas_research_source.sql` widens the CHECK), so they flow into the existing Script Studio. TDD: outlier-idea-generator + client-assets exclusion tests. | claude | In Progress | feature/research-idea-generation |
| BO-071 | "What is Working Now" research-trends section (Step 5 on `/research`). Part 1: the analyzer now classifies each reel's opener into a hook archetype (`hook_type`: STORYTELLING / CONFRONTATIONAL / VULNERABILITY / CURIOSITY / PROOF / EDUCATIONAL), threaded through `MediaAnalysis`, the analysis prompt, both persistence surfaces, and a `hook_type` column on both analysis tables (migration `20260529000000_analysis_hook_type.sql`); existing rows stay null until re-analysed. Part 2: pure `buildResearchTrends` (`src/lib/shared/research-trends.ts`, Vitest-covered) aggregates the outlier reels of every tracked competitor over a recent window into ranked topics (pillar), hook types, and platforms, each with a momentum delta vs the previous window, plus headline metrics (outlier count, avg outlier ratio, avg engagement, rising topic) and a monthly time-series for the top topics. Blended-score model matches the Formula Matrix (reach percentile + trending outlier ratio). Server loader `trends-data.ts`; `TrendsSection` + pure-SVG `TrendsChart` render the dimensions, hook exemplars, and the topic-momentum line chart. | claude | Done | PR #63 |
| BO-072 | Fix: the "Generate 3 ideas" (vault) and "Save to vault" (drill-in) buttons had no hover feedback and no pointer cursor (Tailwind v4 drops the default button cursor). New reusable `.oo-soft-btn` class adds the shared tactile hover (gentle lift + brighten) + pointer cursor for custom-styled buttons whose colours are set inline; applied to both. | claude | Done | PR #64 |
| BO-075 | Fix: "Last analysis failed: Deepgram returned no transcript" on music-only reels. A reel with no speech (music/visual only) makes Deepgram answer 200 with a blank transcript, which two hard gates treated as fatal: `DeepgramTranscriptionClient` threw "no transcript", and `MediaAnalyzer` threw "transcript is empty; refusing to analyze". On the competitor surface the throw was recorded as a tile failure AND re-thrown, so Inngest kept retrying (re-download + re-transcribe) a reel that can never yield speech. Now the client returns `""` for a blank transcript (still throwing only when the response is *malformed*, i.e. the transcript field is missing entirely), and the analyzer substitutes a `NO_SPEECH_TRANSCRIPT` note so Sonnet reads structure from caption + metrics and the note is stored as the transcript (satisfies both analysis tables' not-blank CHECK). Fixes both /library and /research analysis; no migration. TDD: rewrote the deepgram-client empty/malformed tests + the analyzer no-speech test. | claude | In Progress | fix/deepgram-music-no-speech |
| BO-073 | Outlier-idea generator now pulls the full content-strategy stack, matching the weekly /scripts generator. New voice loader `getCurrentOnboardingAnswers` exposes `voice_dna.source_answers`; `OutlierIdeaGenerator` input gains `clientAssets`, `corpusContext`, and a new `OnboardingExtras` shape (ICP extras `thoughts_at_2am` / `internal_battles` / `dreams`, positioning `core_philosophy` / `contrarian_belief` / `differentiator`, story-bank seeds, signature phrases). `buildOutlierIdeaSystemPrompt` reuses the existing `renderClientAssetsBlock` + `renderCorpusContextBlock` (now exported) and adds `renderOnboardingExtrasBlock` (skipped when every field is empty). `generateIdeasFromOutlierAction` loads them all in parallel + best-effort corpus retrieval gated on `VOYAGE_API_KEY`. Hard rule #5 instructs the model to ground each idea in the creator's stories / corpus / contrarian belief / 2am thoughts before reaching for anything generic. TDD: 4 new system-prompt assertions. | claude | In Progress | feature/outlier-idea-deeper-context |

## Phase 1b. Instagram connect polish

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-074 | Surface "how to accept your Instagram Tester invite" steps on the `/library` Connect screen. While the Meta app is in Development mode, OAuth throws "Insufficient Developer role" for any IG account that has not accepted its tester invite, and clients miss the accept step. New pure `tester-invite-steps.ts` (`INSTAGRAM_MANAGE_ACCESS_URL` + numbered `TESTER_INVITE_STEPS`, Vitest-covered, anti-em-dash) consumed by a collapsible `<details>` help block in the Connect empty state linking to instagram.com/accounts/manage_access. No backend change; remove once App Review lands and the tester gate drops. | claude | Done | PR #66 |

## Phase 8. CRM (GoHighLevel / "Hookd")

The Hookd GHL sub-account is the front door (payment, onboarding forms, weekly check-ins, comms) and fires outbound webhooks at each workflow stage to the bot (Option A). The bot processes them and can write pipeline stages back.

| Task ID | Description | Owner | Status | Branch / PR |
| :--- | :--- | :--- | :--- | :--- |
| BO-075 | Switch weekly check-ins from the bot's own Google-Form/Resend loop to GHL. GHL already owns the live "Off&On Weekly Check-In" survey; its *Survey Submitted* workflow gets a Webhook action POSTing answers + email to the new `/api/ghl/webhook`. Endpoint verifies a `GHL_WEBHOOK_SECRET` header (constant-time), parses a tolerant GHL payload (`parseGhlCheckinBody` - flat or `answers`-object shape, email required), resolves the user by email, reuses `saveCheckin` (idempotent on user+week) and emits `voice/dna.refresh.requested`. Retire the bot's outbound check-in: unregister `weeklyCheckinSend` + `weeklyCheckinReminder` from the Inngest serve route so the crons stop firing. The two cron files and their engine helpers (`dispatchWeekly`, `listRecipients`, `getWeekSubmitters`) are left in place but dormant during the migration (re-enable = re-add to the serve array); prune once GHL check-ins are proven in prod. The old `/api/weekly-checkin/webhook` (Google Form) stays dormant. TDD on the GHL parser + secret verify. | claude | In Progress | feature/ghl-checkin-webhook |

## Conventions

- `Owner` is the agent name (e.g. `claude`) or a human name. Empty = unclaimed.
- `Status` is one of: Todo, In Progress, Blocked, Done, Partial.
- `Branch / PR` references the active branch while In Progress and the merged PR number once Done.
- Add a row before writing code; mark Done in the same PR that completes the task.
