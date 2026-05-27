# Pre-Launch Checklist

Everything that needs to happen before onboarding the first paying client. Grouped by category, with concrete actions, who owns each, and rough cost expectations. Tick boxes as you go; a fully-ticked doc = ready to go live.

> Last reviewed: 2026-05-16.

---

## 1. Vendor accounts + billing

Every third-party service the app talks to. For each, the account needs to be on a paid plan (or have prepaid credits) before any client traffic hits production — free-tier surprises (pause, throttle, ban) at 2am with a client onboarded are the worst failure mode.

### 1.1 Anthropic (Claude)
Used for: chat, script generation, voice DNA extraction, memory extractor, IMF extractor, hooks generator, single-script generator, Instagram media analysis, master bot. Models pinned: `claude-sonnet-4-6` (most surfaces), `claude-haiku-4-5-20251001` (memory extractor). Env var: `ANTHROPIC_API_KEY`.

- [ ] Anthropic Console account created at `console.anthropic.com`
- [ ] Workspace promoted out of evaluation tier — go to **Plans & Billing → Plans**, switch to **Build / Scale** as appropriate
- [ ] Payment method on file (credit card or invoice for Scale)
- [ ] Initial credits purchased — **suggest $200–500 to start**. Prompt caching cuts effective cost ~3–5x and is already wired into our `AnthropicLLMClient`, so this lasts longer than the headline price suggests
- [ ] **Usage limit + email alert configured** (Settings → Limits). Set a monthly hard cap that's 2x your expected spend so a runaway loop can't drain credit overnight
- [ ] Rate-limit tier verified — Tier 1 (default after first payment) is fine for early clients; if you onboard >5 simultaneous heavy users you may need to request Tier 2

Expected monthly cost at 5 active clients: **~$50–150** (cached prompts + Haiku for the memory extractor keep it cheap).

### 1.2 Supabase
Used for: Postgres database (with `pgvector` for the corpus engine), auth, RLS, RPC functions, future Realtime if needed. Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

The free tier **will not** carry production. Free auto-pauses inactive projects after 7 days (catastrophic for a client-facing tool), caps DB size at 500 MB, and gives no point-in-time recovery. Once we add Fathom transcripts via BO-052 the corpus alone will blow past 500 MB inside a quarter.

- [ ] Project upgraded to **Pro ($25/mo)**. Settings → Billing → Upgrade.
- [ ] **Point-in-Time Recovery enabled** (+$100/mo). Skip this only if you're OK with daily-backup-only restore granularity
- [ ] Database compute size set appropriately — `Small` is fine to start; bump to `Medium` once embeddings traffic ramps (HNSW index queries are CPU-bound)
- [ ] **`vector` extension confirmed enabled** in Database → Extensions (migration `20260515000000_client_corpus.sql` does `create extension if not exists vector` but Supabase needs the extension allowlisted)
- [ ] Auth → SMTP set to a custom provider (Resend / Postmark / SES) — Supabase's default SMTP is rate-limited to 3 emails/hr, useless for real magic-link / invite traffic. **This will block invites at scale**
- [ ] **Custom domain** configured (Settings → Custom Domains) — `auth.offandon.io` or similar. The default `*.supabase.co` URL works but looks unprofessional in OAuth flows
- [ ] Daily backups verified — Settings → Database → Backups. Confirm a recent backup exists
- [ ] All migrations in `supabase/migrations/` applied to production. The migrations folder is the source of truth — re-run any not yet applied (currently `20260515000000_client_corpus.sql` is unapplied as of this writing)

Expected monthly cost: **$25 base + $100 for PITR = $125/mo**. Egress, compute upgrades, and read replicas add later as needed.

### 1.3 Vercel
Used for: hosting the Next.js app, edge middleware for auth, cron-like background scheduling via Inngest (not Vercel Cron).

- [ ] **Pro plan ($20/mo per team member)** — Hobby is *non-commercial only*; using it for paid clients violates ToS
- [ ] Project linked to the GitHub repo `olly-johnson/offandon`
- [ ] **All environment variables added** (see §3 below) for **Production**, **Preview**, and **Development** scopes
- [ ] Production domain attached (`offandon.io`) + SSL active
- [ ] Preview deployments enabled for PRs (default) — useful for client demos before merge
- [ ] **Function region** set to match Supabase region (Settings → Functions → Region). Cross-region adds ~100ms per Supabase round trip — measurable on a chat reply
- [ ] **Speed Insights + Web Analytics** enabled (Pro includes them) — cheap visibility into real-world latency
- [ ] Deployment protection: production deploys require successful CI

Expected monthly cost: **$20/mo per seat**. Bandwidth + function-GB-hour overages are unlikely at <50 clients.

### 1.4 Inngest
Used for: script-generation jobs, nightly Instagram sync (cron `0 3 * * *` UTC), media analysis jobs. Env vars: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.

- [ ] Account created at `inngest.com`
- [ ] App registered, pointed at `https://<prod-domain>/api/inngest`
- [ ] **Production `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`** generated and added to Vercel env
- [ ] `INNGEST_DEV` env var **NOT** set in production (it's the dev-mode bypass)
- [ ] Plan reviewed — Free covers 50k steps/mo, which is roughly: 1 nightly sync × 30 days × N clients + a few script gens + media analyses per client. **At ~5 clients you're fine on Free**; budget Starter ($30/mo for 100k steps) once client count grows
- [ ] Webhook signing verified — hit the Inngest dashboard's "Send test event" and confirm the app receives it in prod

### 1.5 Voyage AI (embeddings)
New as of BO-049. Used for: `search_client_corpus` retrieval (chat) and implicit script retrieval (PR3+). Model: `voyage-3`, 1024-d. Env var: `VOYAGE_API_KEY`.

- [ ] Account created at `dash.voyageai.com`
- [ ] **API key generated** and added to Vercel env (+ `.env.local` for dev)
- [ ] Payment method on file — free tier gives 50M tokens, easily 6–12 months at our volume, but card-on-file prevents a service interruption when it runs out
- [ ] Usage dashboard bookmarked

Expected monthly cost: **$0–10** for the foreseeable future. Embeddings are cheap.

### 1.6 Deepgram (audio transcription)
Used for: Instagram video transcription in BO-043 / research analysis. Model: `nova-3`. Env var: `DEEPGRAM_API_KEY`.

- [ ] Account at `deepgram.com`
- [ ] **$200 free credit applied** (standard signup credit, no card needed initially)
- [ ] Payment method added before credit runs out
- [ ] `DEEPGRAM_API_KEY` in Vercel env
- [ ] Rate-limit knob set sensibly — `RESEARCH_ANALYSIS_MAX_PER_30D` defaults to 400/user/30d (shared across /library + competitor analysis; covers a full 5-creator watchlist at 30 reels each plus library use). Confirm this is the right ceiling for your pricing model

Expected monthly cost: **~$0.0043/min × ~30 videos × 5 clients ≈ $1–5/mo**.

### 1.7 Meta / Instagram (Graph API)
Used for: per-client OAuth, content library sync, insights. Env vars: `IG_APP_ID`, `IG_APP_SECRET`, `IG_OAUTH_REDIRECT_URI`, `IG_ALLOW_PASTE_TOKEN` (dev only).

The Graph API itself is free, but App Review gates production access. Until reviewed, the app is in **Development Mode** and only people added as Testers in the Meta dashboard can connect. See §4 for the full App Review checklist.

- [ ] Meta App created at `developers.facebook.com`, type "Business"
- [ ] **Instagram + Facebook Login for Business** products added to the app
- [ ] Scopes requested: `instagram_business_basic`, `instagram_business_manage_insights`
- [ ] `IG_APP_ID` + `IG_APP_SECRET` added to Vercel env
- [ ] `IG_OAUTH_REDIRECT_URI` set to the **production** callback URL (`https://<prod>/api/auth/instagram/callback`), and that exact URL registered as a Valid OAuth Redirect URI in the Meta dashboard
- [ ] `IG_ALLOW_PASTE_TOKEN` **NOT** set in production (it's a dev-only fallback)
- [ ] Each beta client added as a **Tester** in the Meta dashboard (per memory note: "operator work — invite each beta client as a Tester")

### 1.8 Email (transactional) — Resend
Used for two distinct email paths sharing one Resend account:
1. **Supabase auth emails** (invites, magic links, password resets) — wired via Supabase Auth → SMTP. Currently using Supabase's built-in SMTP, which is rate-limited to ~3/hr and will block invites at scale.
2. **Weekly check-in cron + reminder** (BO-057..BO-060) — sent directly via Resend's HTTPS API from the Inngest functions. Env vars: `RESEND_API_KEY`, `EMAIL_FROM`. When either is unset the email client falls back to a dry-run that logs and discards, so previews and local dev never accidentally mail anyone.

**Hard prerequisite**: Resend (and every other reputable provider) requires a domain you control DNS for. Free Vercel subdomains (`*.vercel.app`) can't add SPF/DKIM records, so they can't be verified. You will need to register the production domain in §6 before this section is unblockable.

> Status as of 2026-05-16: feature code merged (PR #52) but live email blocked on domain registration. Until the domain exists the Inngest crons run as no-ops (`dry-run email (RESEND_API_KEY unset)` in logs); the rest of the stack (Apps Script → webhook → `weekly_checkins` row → voice DNA refresh) is independent of Resend and can be smoke-tested first.

**One-time Resend setup (do once after §6 domain is registered):**

- [x] Account created at `resend.com/signup` (free, no card)
- [x] Sending domain added in **Domains → Add Domain** (`offandon.io`)
- [x] Three DNS records added at the registrar (Namecheap — required switching Mail Settings → Custom MX to enable the MX option):
  - 1× **MX** `send` → `feedback-smtp.ap-northeast-1.amazonses.com` priority 10
  - 1× **TXT** `send` (SPF: `v=spf1 include:amazonses.com ~all`)
  - 1× **TXT** `resend._domainkey` (DKIM)
  - 1× **TXT** `_dmarc` → `v=DMARC1; p=none;` (optional but added)
- [x] All three rows showing **Verified** in Resend (propagation usually <5 min)
- [x] API key generated under **API Keys → Create API Key** — name `bot-os-production`, permission **Sending access**, scoped to the verified domain. Copy the `re_...` value immediately; Resend won't show it again
- [x] Smoke test confirmed via Supabase password-reset flow (see "Wire to Supabase auth" below) — first-send landed in Gmail Inbox, From: `Off&On <noreply@offandon.io>`. Curl smoke test below is alternative/redundant now:
  ```
  curl -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"from":"weekly@<domain>","to":["your-personal@gmail.com"],"subject":"test","text":"hi"}'
  ```
  Expect `{"id":"re_..."}` and an inbox arrival within ~10s. If 422, the from-domain isn't verified.

**Wire to Supabase auth (for invites / magic links):**

- [x] Resend credentials pasted into **Supabase → Authentication → Emails → SMTP Settings** (the dashboard moved this — it's now under Notifications → Emails → SMTP Settings tab). Host `smtp.resend.com` / port 465 / username `resend` / password = `re_…` API key / sender `noreply@offandon.io` / sender name `Off&On`
- [x] Test send via the password-reset flow — delivered to Gmail Inbox via Resend
- [ ] Custom email templates (BO-014) finished — invite is done; password reset + magic-link pending. Block-or-defer decision before launch

**Wire to weekly check-in (BO-057..BO-060):**

- [ ] `RESEND_API_KEY`, `EMAIL_FROM`, `WEEKLY_CHECKIN_FORM_URL`, `WEEKLY_CHECKIN_WEBHOOK_SECRET` added to Vercel **Production** env (see §3). Optionally also **Preview** if you want preview branches to send for real; safer to leave preview unset so it stays in dry-run
- [ ] Generate the webhook secret: `openssl rand -hex 32`
- [ ] Google Form created via `python examples/create_weekly_checkin_form.py` (writes `WEEKLY_CHECKIN_FORM_URL` into `.env`)
- [ ] Apps Script attached to the form (full template + steps in `docs/weekly-checkin.md` §3). Script properties `WEBHOOK_URL` + `WEBHOOK_SECRET` set, `On form submit` trigger added
- [ ] Form Settings → Responses → **Collect email addresses = ON** (the webhook resolves the user by email; without this it'll 400 every submission)
- [ ] End-to-end smoke test (per `docs/weekly-checkin.md` §5):
  - Submit a test response as yourself
  - Apps Script log shows `webhook ... -> 200`
  - Row in `public.weekly_checkins` for your user
  - Inngest run of **Voice DNA: weekly refresh** completes green
  - `public.voice_dna` has a new active row, previous one is `superseded_at`-stamped
- [ ] Manually invoke **Weekly check-in: Friday send** from Inngest UI to confirm cohort blast works (subject line "Your Off&On weekly check-in is open" lands in your inbox)
- [ ] Submit as user A but not user B, then manually invoke **Weekly check-in: Saturday reminder** — confirm only user B is in the dispatch log

**Expected free-tier headroom**: 3,000 emails/month with a **100/day cap**. At 2 sends/user/week the monthly cap holds to ~375 active users; the daily cap is the tighter constraint and breaks at **>100 recipients in a single cron blast**. If you cross 100 active clients, upgrade to Pro ($20/mo, 50k/mo, no daily cap) *before* the next Friday — partial drops on the free tier won't be retried.

### 1.9 Error tracking + monitoring
Not currently wired. **Strongly recommended before clients touch it.**

- [ ] **Sentry** (or similar) account created
- [ ] `@sentry/nextjs` installed, wrapped around `next.config.ts`
- [ ] Source maps uploaded on each deploy
- [ ] Alert routes set: errors → Slack/email, latency spikes → email
- [ ] Logger integration — pipe `createLogger` errors to Sentry breadcrumbs (already has the right shape)

Skipping this is fine if you're literally watching dashboards manually for the first week, but you will regret it on day 8.

---

## 2. Database + migrations readiness

- [ ] All migrations in `supabase/migrations/` applied to production, in order
- [ ] Latest migration is **`20260515000000_client_corpus.sql`** (BO-049). Confirm it ran cleanly
- [ ] `pgvector` extension active (`select * from pg_extension where extname = 'vector';` should return a row)
- [ ] HNSW index on `client_document_chunks.embedding` exists (`\d+ client_document_chunks` shows it)
- [ ] `match_client_chunks` RPC callable by the authenticated role (test from the Supabase SQL editor as a non-service-role user)
- [ ] **Service-role grants applied** — the Supabase setting "Automatically expose new tables" is OFF in this project (per `CLAUDE.md` / `BO-028`). Every migration grants `select` to `authenticated` and `all` to `service_role` explicitly; verify by hand on a new table before deploying it
- [ ] `delete_user_data` function tested end-to-end on a throwaway user — confirm every table is wiped
- [ ] Daily backup confirmed working in Supabase dashboard
- [ ] A restore drill has been done at least once on a staging project (you don't want to learn the restore flow during a real incident)

---

## 3. Production environment variables

Full list, grouped by where each is consumed. Every one of these must be set in Vercel **Production** before launch. Preview + Development can share most values; secrets that differ between environments are flagged.

**Supabase**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — production project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — production anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — production service role key (Server only; do NOT expose to client)

**Anthropic**
- [ ] `ANTHROPIC_API_KEY` — production key (separate from dev key if you can — easier to rotate)

**Voyage**
- [ ] `VOYAGE_API_KEY` — production key

**Inngest**
- [ ] `INNGEST_EVENT_KEY` — production event key
- [ ] `INNGEST_SIGNING_KEY` — production signing key
- [ ] `INNGEST_DEV` — **must be unset in production**

**Instagram / Meta**
- [ ] `IG_APP_ID`
- [ ] `IG_APP_SECRET`
- [ ] `IG_OAUTH_REDIRECT_URI` — production callback URL, exact match with Meta dashboard
- [ ] `IG_ALLOW_PASTE_TOKEN` — **must be unset in production**

**Deepgram**
- [ ] `DEEPGRAM_API_KEY`

**Email + Weekly check-in (BO-057..BO-060)**
- [ ] `RESEND_API_KEY` — from resend.com after domain verification (see §1.8). When unset, the email client falls back to dry-run; safe but the Friday/Saturday crons won't actually send
- [ ] `EMAIL_FROM` — e.g. `Off&On <hello@offandon.io>` (or `weekly@offandon.io` for the cron path). The domain MUST be the one verified in Resend
- [ ] `WEEKLY_CHECKIN_FORM_URL` — public viewform URL the Friday/Saturday emails link to. Written to `.env` automatically by `examples/create_weekly_checkin_form.py`
- [ ] `WEEKLY_CHECKIN_WEBHOOK_SECRET` — shared secret with the Apps Script `WEBHOOK_SECRET` property; used to verify HMAC on inbound posts. Generate with `openssl rand -hex 32`

**Feature flags / operational knobs**
- [ ] `RESEARCH_ANALYSIS_DISABLED` — set to `1` if you want media analysis off at launch
- [ ] `RESEARCH_ANALYSIS_MAX_PER_30D` — defaults to 400/user/30d; override if your pricing model assumes a different cap
- [ ] `LOG_LEVEL` — defaults to `info` in production. Set to `debug` only during incident response

**Sentry (if used)**
- [ ] `SENTRY_DSN`
- [ ] `SENTRY_AUTH_TOKEN` (for source-map uploads)

---

## 4. Meta App Review (Instagram)

The app is currently in Meta's **Development Mode**. Real users beyond Testers cannot connect their Instagram account. App Review unlocks production access for the requested scopes.

Per `project_instagram_meta_todos.md` in memory:

- [ ] **Privacy Policy URL** published and reachable (`https://<prod>/privacy`). Required content: what data we collect, retention, third parties, deletion process
- [ ] **Terms of Service URL** (recommended, not strictly required)
- [ ] **Data Deletion URL** published. Two options accepted by Meta:
  - A user-facing page that explains how to request deletion (simplest)
  - A callback endpoint that Meta POSTs to on user request (more robust). `delete_user_data` RPC already exists; an `/api/meta/data-deletion` endpoint would wrap it
- [ ] **Screencast** recorded showing the OAuth flow + how Instagram data is used in-app. 2–5 min, screen recording, narrated
- [ ] **Business verification** completed in Meta dashboard (requires company documents)
- [ ] **App Review submission** drafted — write a clear justification for each requested scope:
  - `instagram_business_basic` — needed to identify the connected account in our library view
  - `instagram_business_manage_insights` — needed to power the per-post engagement dashboard
- [ ] Submitted, waiting on Meta (turnaround: 3–10 business days, occasionally longer)

Until App Review passes, **every client must be added as a Tester individually** through the Meta dashboard. That's fine for 1–5 beta clients; not fine at scale.

---

## 5. GDPR + compliance

- [ ] `delete_user_data` RPC verified (see §2)
- [ ] **In-app account deletion** surfaced to users — currently no UI button exists. Decide: ship before launch or document the manual process (operator runs the RPC on request). For GDPR strictness, the in-app path is cleaner
- [ ] `data_policy_accepted` checkbox enforced in onboarding (already in schema)
- [ ] Privacy policy linked from `/signin` + `/onboarding`
- [ ] Data-export endpoint — optional but tidy. GDPR right to portability technically requires it
- [ ] Subprocessor list maintained — at minimum: Anthropic, Supabase, Vercel, Voyage, Deepgram, Inngest, Meta, Resend (or chosen email provider). Publish at `/privacy#subprocessors`

---

## 6. Domain + DNS

This blocks §1.8 (Resend) and parts of §1.2 (Supabase auth custom domain). Vercel's `*.vercel.app` subdomains can't add the SPF/DKIM records Resend requires, so email is dry-run-only until the real domain exists. Cheap registrars: Namecheap, Porkbun, Cloudflare Registrar (~$10–15/yr).

- [x] Production domain registered (`offandon.io`)
- [ ] Domain attached to Vercel + SSL active
- [x] DNS records for email provider (Resend MX + 2× TXT + optional DMARC — see §1.8). Verified 2026-05-19
- [ ] `auth.offandon.io` CNAME for Supabase custom domain (if using §1.2)
- [ ] Status page domain / subdomain (optional but cheap reassurance)

---

## 7. Ops readiness

- [ ] CI status check required for `main` (GitHub branch protection rules)
- [ ] Two reviewers minimum on any PR touching migrations or auth (recommend — set in branch protection)
- [ ] Deployment runbook written: how to roll back a bad deploy, how to apply a migration in prod, who to call
- [ ] Backup-restore drill done (see §2)
- [ ] On-call expectations agreed with team (even informally — "Olly checks Sentry every morning" counts as a process)
- [ ] Smoke test script — list of 5–10 manual checks to run against production after any deploy (sign in, send a chat, generate a script, connect Instagram, edit methodology)

---

## 8. First-client onboarding rehearsal

Before the first real client touches the system, run the full flow yourself against production:

- [ ] Create a fresh test account via admin invite
- [ ] Complete the onboarding wizard
- [ ] Connect Instagram (as a Tester account)
- [ ] Wait for the nightly Inngest sync to populate the library
- [ ] Run media analysis on one video
- [ ] Generate a script batch
- [ ] Have a real chat conversation
- [ ] Save an idea via the chat tool
- [ ] Edit methodology in `/methodology` and confirm next chat reflects it
- [ ] Trigger `delete_user_data` for this test account and confirm a clean wipe

If any step fails, that's the launch blocker.

---

## 9. Expected monthly burn at launch

Rough numbers for 5 active clients, mid-volume usage:

| Vendor | Monthly | Notes |
| :--- | ---: | :--- |
| Anthropic | $50–150 | Cached prompts keep this down |
| Supabase Pro | $25 | + $100 if PITR enabled |
| Vercel Pro | $20 | per seat |
| Inngest | $0 | Free tier holds through ~10 clients |
| Voyage | $0–10 | Free tier for ages |
| Deepgram | $1–5 | $200 credit lasts months |
| Email (Resend) | $0 | Free tier covers 3k emails/mo |
| Sentry | $0–26 | Free tier or Team plan |
| **Total** | **~$100–340/mo** | Most of it is fixed; client-count-sensitive piece is Anthropic |

Comfortable rule of thumb: **plan for $300/mo at launch, scaling roughly linearly with active client count above 5**.

---

## Open items currently on the task board

These should be Done (or explicitly Deferred) before launch, per `docs/TASK_BOARD.md`:

- **BO-014** — Custom email templates: invite done; password reset + magic link pending
- **BO-015** — Surface `error` query param on `/signin`
- **BO-016** — `unwrapSupabaseError` helper
- **BO-026** — Stuck-batch sweeper (cron mark batches stuck > 5 min as failed)
- **BO-027** — "Cancel batch" button on `/scripts`
- **BO-028** — Document the "auto-expose new tables = OFF" Supabase setting
- **BO-039** — Deferred; revisit if outputs degrade
- **BO-043** — Instagram video analysis (In Progress)
- **BO-048** — Master Bot for methodology edits (In Progress)
- **BO-050 / 051 / 052** — Corpus PRs 2, 3, 4 (not started; not launch-blocking — system works without them, they just unlock the Tier-2 retrieval path)

Decide for each: Ship before launch / Ship after launch / Won't ship. Tag accordingly.
