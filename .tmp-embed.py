import base64

with open("public/logo.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode("ascii")

with open("supabase/templates/invite.html", "r", encoding="utf-8") as f:
    html = f.read()

old_img = (
    '<img src="{{ .SiteURL }}/logo.png" alt="ABS Creative Studios" '
    'width="72" height="72" style="display:block;border-radius:50%;'
    'border:1px solid #E5E1D7;" />'
)
new_img = (
    f'<img src="data:image/png;base64,{b64}" alt="ABS Creative Studios" '
    'width="72" height="72" style="display:block;border-radius:50%;'
    'border:1px solid #E5E1D7;" />'
)
assert old_img in html, "old img tag not found"
html = html.replace(old_img, new_img)

old_copy = (
    "Bot OS is the AI operating system for Instagram creators. "
    "You've been added as a beta user. Click the button below to set "
    "your password and start."
)
new_copy = (
    "Bot OS is the AI operating system for ABS Creative Studios. "
    "You've been added as a user. Click the button below to set your "
    "password and start."
)
assert old_copy in html, "old copy not found"
html = html.replace(old_copy, new_copy)

old_comment = (
    "    - Logo loaded from the live site so it stays in sync with the app."
)
new_comment = (
    "    - Logo base64-embedded so the email is self-contained "
    "(no public URL required)."
)
html = html.replace(old_comment, new_comment)

with open("supabase/templates/invite.html", "w", encoding="utf-8", newline="\n") as f:
    f.write(html)

print(f"done; final size {len(html)} bytes")
