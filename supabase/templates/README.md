# Supabase email templates

These templates are the source of truth for the branded copy. The Supabase CLI is not wired up yet, so they don't sync automatically; you paste them into the dashboard whenever they change.

## How to apply

1. Open Supabase → **Authentication** → **Emails** → **Templates**.
2. Pick the template that matches the filename here (`invite.html` → "Invite user").
3. Copy the file contents and paste into the dashboard editor.
4. Save. The next email of that type will use the new template.

## Variables

Supabase uses Go template syntax. The variables vary by template type; common ones:

- `{{ .ConfirmationURL }}`: click-through link (set automatically per send) — see warning below
- `{{ .Email }}`: recipient address
- `{{ .SiteURL }}`: your project's Site URL (set in Auth, URL Configuration)
- `{{ .Token }}` / `{{ .TokenHash }}`: OTP code / hash
- `{{ .RedirectTo }}`: post-confirmation redirect

## Why we DON'T use `{{ .ConfirmationURL }}`

The default `ConfirmationURL` points at Supabase's `/auth/v1/verify` endpoint with `redirect_to=<Site URL root>`. After verification, Supabase 302s the browser to the site root with no auth cookies. Our root has no auth handler, so the user lands on `/signin` while Supabase has already marked them as registered. Token consumed, session never lands.

Use the explicit `token_hash` form instead, which hits our `/auth/confirm` route directly:

    {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<invite|recovery|magiclink|email>

`/auth/confirm` calls `supabase.auth.verifyOtp({ token_hash, type })` server-side, which lands the session in response cookies, then redirects to `/onboarding/set-password` (or `?next=` if specified). See `src/app/auth/confirm/route.ts`.

## Asset hosting

No image is currently used. Gmail rendered both `data:` URIs and the GitHub raw URL unreliably (broken-image icon in the preview pane even though the asset returned 200), so brand presence is carried by the headline and the "ABS CREATIVE STUDIOS" wordmark in the footer.

When the app is deployed, the cleanest reinstate path is to upload the logo into a Supabase Storage public bucket and reference that URL — it survives repo visibility changes and has CDN caching baked in. The image markup that previously sat above the headline is preserved in git history if you want to restore it.

## Files

| File          | Maps to dashboard template | Status   |
| :------------ | :------------------------- | :------- |
| `invite.html` | Invite user                | Live     |

`magic-link.html`, `recovery.html`, `confirmation.html` to follow. When you add them, mirror them into the dashboard the same way.
