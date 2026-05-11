# Supabase email templates

These templates are the source of truth for the branded copy. The Supabase CLI is not wired up yet, so they don't sync automatically; you paste them into the dashboard whenever they change.

## How to apply

1. Open Supabase → **Authentication** → **Emails** → **Templates**.
2. Pick the template that matches the filename here (`invite.html` → "Invite user").
3. Copy the file contents and paste into the dashboard editor.
4. Save. The next email of that type will use the new template.

## Variables

Supabase uses Go template syntax. The variables vary by template type; common ones:

- `{{ .ConfirmationURL }}`: click-through link (set automatically per send)
- `{{ .Email }}`: recipient address
- `{{ .SiteURL }}`: your project's Site URL (set in Auth, URL Configuration)
- `{{ .Token }}` / `{{ .TokenHash }}`: OTP code / hash
- `{{ .RedirectTo }}`: post-confirmation redirect

## Asset hosting

The logo is loaded from GitHub raw at `https://raw.githubusercontent.com/olly-johnson/offandon/main/public/logo.png`. This works because the repo is public; Gmail strips base64 `data:` URIs as an anti-tracking measure, so a hosted URL is the only path that renders the image in every client.

If you ever flip the repo private, the email image will break. Two ways out:

1. Push `public/logo.png` into a Supabase Storage public bucket and use that URL instead. The bucket URL is permanent and doesn't depend on repo visibility.
2. Deploy the app, set the Supabase Site URL to the deployed origin, and switch the `<img src>` back to `{{ .SiteURL }}/logo.png`.

## Files

| File          | Maps to dashboard template | Status   |
| :------------ | :------------------------- | :------- |
| `invite.html` | Invite user                | Live     |

`magic-link.html`, `recovery.html`, `confirmation.html` to follow. When you add them, mirror them into the dashboard the same way.
