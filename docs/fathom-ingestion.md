# Fathom transcript ingestion (BO-061)

Auto-pull every completed Fathom recording into the client corpus and expose
it under `/transcripts` so users can read the transcript directly.

**Multi-attendee routing**: a single Fathom call is shared across every
attendee who has a site account (the operator AND each client with a
matched email). Each gets their own row in `client_documents` so RLS
keeps the surface scoped per user, but the underlying transcript is the
same. The `fathom_email_aliases` table bridges Fathom emails that differ
from `auth.users.email`.

## Wire shape

```
fathom.video
   |
   |   (live) per-recording webhook (HMAC-SHA256)
   v
/api/fathom/webhook  (POST)
   |   - verifies X-Fathom-Signature
   |   - normalises the recording (flattens structured transcript)
   |   - resolves every attendee email against auth.users + fathom_email_aliases
   |   - chunks + Voyage embeds + writes one row per matched user
   v
/transcripts list + /transcripts/{id} detail  (Next.js, RLS-scoped)

         (backfill) npm run backfill:fathom
            |
            |   GET /external/v1/meetings?cursor=...  (X-Api-Key auth)
            v
         same resolveAttendees + ingestFathomRecording path
```

Ingestion is synchronous from the webhook (chunk + embed takes ~5-15s for
a 1-hour call, well within Vercel's function timeout). No Inngest indirection.
The backfill script reuses the same engine code so the two paths can't
diverge.

## Environment

Three variables are required in production. Missing env triggers a 500
on the webhook or a hard error from the backfill script.

| Var | Where | Notes |
| :--- | :--- | :--- |
| `FATHOM_WEBHOOK_SECRET` | Fathom dashboard webhook config | Shared with the route; HMAC-SHA256 over the raw body |
| `FATHOM_API_KEY` | Fathom > Settings > Developers | Used by the backfill script; the live webhook does NOT call the API |
| `VOYAGE_API_KEY` | Voyage dashboard | Already required by the corpus engine; same key |

## Idempotency

The upsert key is `(user_id, source_path)` with `source_path = fathom://<recording_id>`.
Re-runs (Fathom webhook retries, manual replays, the backfill script) overwrite
cleanly — the document is updated and its chunks replaced.

## Operator setup

1. In Fathom > Settings > Integrations > Webhooks, add a webhook pointed at
   `https://<your-domain>/api/fathom/webhook`. Generate a long secret (e.g.
   `openssl rand -hex 32`) and paste it as `FATHOM_WEBHOOK_SECRET` in Vercel.
2. In Fathom > Settings > Developers > API, generate a personal API key and
   paste it as `FATHOM_API_KEY` in Vercel.
3. Set `FATHOM_OPERATOR_EMAILS` to your own email(s) on Fathom calls. The
   webhook prefers Fathom's `is_external` flag when present; this acts as
   the fallback.
4. Push a deploy so the route is live. Take a 1-minute test call in
   Fathom and confirm the recording appears under `/transcripts` after
   Fathom finishes processing.

## Backfilling existing recordings

```bash
# 1. See who/what would be ingested if we ran now.
npm run backfill:fathom -- --dry-run

# 2. Identify Fathom emails that don't yet map to a site user.
npm run backfill:fathom -- --unmatched

# 3. Map Fathom emails to site users where the addresses differ.
npm run fathom:aliases -- --add <user_id> <fathom_email>

# 4. Pull every historical recording (idempotent, can re-run).
npm run backfill:fathom

# Smaller test runs.
npm run backfill:fathom -- --since=2026-01-01 --limit=5
```

The script paginates `/external/v1/meetings` (newest first). For each
recording it resolves every attendee against `auth.users.email` AND
`fathom_email_aliases.fathom_email`, then ingests one document row per
matched user. Unmatched emails are tallied and printed at the end with
frequency, so you can prioritise which aliases to create.

After adding aliases, just re-run `npm run backfill:fathom` — the upsert
key `(user_id, source_path)` means already-ingested users won't get
duplicates, and newly-mapped users pick up the full historical archive.

## Managing aliases

```bash
# List every alias.
npm run fathom:aliases -- --list

# List aliases for one user.
npm run fathom:aliases -- --list <user_id>

# Add a mapping (case-insensitive on the email).
npm run fathom:aliases -- --add <user_id> client@personal.com

# Remove a mapping.
npm run fathom:aliases -- --remove <user_id> client@personal.com
```

A single user can have multiple aliases (work + personal email + the
auth address). A single Fathom email can map to multiple users (rare,
but useful when two site users share a calendar invite address) — each
gets their own document row.

## Smoke test (local)

```bash
SECRET="$FATHOM_WEBHOOK_SECRET"
BODY='{"recording_id":99999,"recording_start_time":"2026-05-17T10:00:00Z","calendar_invitees":[{"email":"client@example.com","is_external":true}],"transcript":[{"speaker":{"display_name":"Op"},"text":"hello","timestamp":"00:00"}]}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -sS -X POST http://localhost:3000/api/fathom/webhook \
  -H "Content-Type: application/json" \
  -H "X-Fathom-Signature: sha256=$SIG" \
  --data "$BODY"
```

Expected: `{"ok":true,"recording_id":"99999",...}` if `client@example.com`
exists in `auth.users`, else `{"ok":true,"skipped":true,...}`.

## Mapping rule

The webhook + backfill resolve attendees by:

1. Collecting every email from `calendar_invitees` plus `recorded_by`.
2. For each email, finding any matching `user_id` via `auth.users.email`
   (case-insensitive).
3. For any email that didn't match, looking it up in
   `public.fathom_email_aliases`.
4. Ingesting the recording once per `(user_id, email)` pair found.
5. Reporting unmatched emails so the operator can populate the alias table.
