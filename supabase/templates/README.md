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

The logo is base64-embedded directly in `invite.html`, so the email is self-contained and works without any deployed site. Trade-off: a logo update means regenerating the inlined base64. Easiest way:

```bash
python3 - <<'PY'
import base64
b64 = base64.b64encode(open("public/logo.png","rb").read()).decode()
print(f"data:image/png;base64,{b64}")
PY
```

Paste the output as the new `src` value.

Final file is ~70KB. Gmail clips message bodies over 102KB, so leave headroom; if the design grows past ~85KB, switch to a publicly hosted image URL instead of base64.

## Files

| File          | Maps to dashboard template | Status   |
| :------------ | :------------------------- | :------- |
| `invite.html` | Invite user                | Live     |

`magic-link.html`, `recovery.html`, `confirmation.html` to follow. When you add them, mirror them into the dashboard the same way.
