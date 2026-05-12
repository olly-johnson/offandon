# Deploying Bot OS

One-time walkthrough for getting Bot OS live on Vercel + the existing Supabase project. Everything in this doc is operator-side (browser dashboards, env-var pasting) because the actions that go live touch external systems where you have to be the human signed in.

## Prerequisites

- Vercel account (free tier is fine for the MVP)
- GitHub access to `olly-johnson/offandon`
- Supabase project already provisioned (it is)
- Inngest account (needed only when you want background jobs in prod)
- Anthropic API key
- Meta developer app (BO-005 already set up)

## Step 1: Import the repo into Vercel

1. Open <https://vercel.com/new> and sign in with GitHub.
2. Pick the `olly-johnson/offandon` repo. Vercel auto-detects Next.js; leave the framework preset alone.
3. Don't deploy yet. Click "Environment Variables" first.

## Step 2: Paste environment variables

All of the below go under "Production" scope. Copy from your local `.env.local` for the live values; never check them in.

**Required:**

| Name | Source |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase, Settings, API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Settings, API. Server-only. |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `IG_APP_ID` | Meta dashboard, Instagram product page |
| `IG_APP_SECRET` | Meta dashboard, Instagram product page (the Instagram-app secret, not the main App secret) |
| `IG_OAUTH_REDIRECT_URI` | `https://<your-vercel-host>/api/auth/instagram/callback` |

**Required once Inngest production is wired up (Step 5):**

| Name | Source |
| :--- | :--- |
| `INNGEST_EVENT_KEY` | inngest.com, your app, Manage, Event Keys (Production) |
| `INNGEST_SIGNING_KEY` | inngest.com, your app, Manage, Signing Key (Production) |

**Do NOT set in production:**

- `INNGEST_DEV` — local-only flag. If this is set in prod, the SDK skips signature verification and treats every webhook as authentic. Bad.
- `IG_ALLOW_PASTE_TOKEN` — only set if you want the paste-token fallback visible to prod users; default off is correct.

**Optional:**

| Name | Default |
| :--- | :--- |
| `LOG_LEVEL` | `info` in production, `debug` otherwise |

## Step 3: First deploy

Click "Deploy". Build takes ~2 minutes. You'll get a URL like `offandon-<hash>.vercel.app`. Open it; you should see the signin page.

## Step 4: Wire Supabase to the live URL

In Supabase, Authentication, URL Configuration:

- **Site URL**: `https://<your-vercel-host>` (no trailing slash)
- **Redirect URLs**: add `https://<your-vercel-host>/auth/callback` and `https://<your-vercel-host>/auth/confirm`

This is what makes the invite email links and password-reset links actually land back on your site instead of localhost.

## Step 5: Wire Inngest to the live URL

1. inngest.com, sign in, create a new app if you don't have one.
2. Add a production environment (or use the default).
3. Register the prod URL: `https://<your-vercel-host>/api/inngest`.
4. Copy the Event Key and Signing Key for that environment.
5. Paste them into Vercel as `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
6. Redeploy on Vercel to pick up the new vars (commit, push, or hit Redeploy on the dashboard).

Until Step 5 is done the app runs fine for everything except cron jobs and the nightly Instagram sync.

## Step 6: Wire Meta OAuth to the live URL

In Meta dashboard, app `Off&On`, Instagram, API setup with Instagram login, step 4 (Business login settings):

- Add `https://<your-vercel-host>/api/auth/instagram/callback` to "Valid OAuth Redirect URIs".
- Save.

Local-dev redirect URI can stay in the list alongside; Meta supports multiple.

## Step 7: Apply pending email templates

In Supabase, Authentication, Emails, Templates:

- Open "Invite user".
- Paste `supabase/templates/invite.html` from the repo.
- Save.

## Step 8: Smoke test

- Sign in with your admin account.
- Hit `/admin/invite`. Invite a throwaway address. Confirm email lands and the click-through reaches `/onboarding/set-password` on your prod host.
- Open `/library`, click Connect with Instagram, complete the OAuth flow against your tester IG account.
- Open `/scripts`, kick off a small batch, watch for the row to flip from running to complete (this exercises Inngest).
- Open `/chat`, send a message, confirm a response.

## Custom domain (optional)

Once everything works on `*.vercel.app`:

1. In Vercel, Settings, Domains, add your domain.
2. Update DNS at your registrar (CNAME to `cname.vercel-dns.com` or follow Vercel's exact instructions).
3. Wait for cert provisioning (a few minutes).
4. Repeat Steps 4 and 6 for the new domain (Supabase Site URL + Redirect URLs, Meta OAuth Redirect URI). Vercel auto-rewrites the env vars in place if you set them via the Vercel dashboard, but Supabase and Meta don't know your domain changed.

## Rollback

Vercel keeps every previous deploy. If a release breaks something, the fastest fix is to open Vercel, Deployments, find the last working one, click "Promote to Production". DNS doesn't change; the URL just routes to the older build.

For DB issues, Supabase has point-in-time recovery on the Pro tier. On the free tier, you have daily snapshots only.
