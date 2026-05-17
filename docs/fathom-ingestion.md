# Fathom transcript ingestion (BO-061)

Auto-pull every completed Fathom recording into the client corpus and expose
it under `/transcripts` so users can read the transcript directly.

## Wire shape

```
fathom.video
   |
   |   (live) per-recording webhook (HMAC-SHA256)
   v
/api/fathom/webhook  (POST)
   |   - verifies X-Fathom-Signature
   |   - normalises the recording (flattens structured transcript)
   |   - picks the client invitee (is_external=true preferred, else FATHOM_OPERATOR_EMAILS filter)
   |   - resolves user_id by email in auth.users
   |   - chunks + Voyage embeds + writes to client_documents / chunks
   v
/transcripts list + /transcripts/{id} detail  (Next.js, RLS-scoped)

         (backfill) npm run backfill:fathom
            |
            |   GET /external/v1/meetings?cursor=...  (X-Api-Key auth)
            v
         same ingestFathomRecording path
```

Ingestion is synchronous from the webhook (chunk + embed takes ~5-15s for
a 1-hour call, well within Vercel's function timeout). No Inngest indirection.
The backfill script reuses the same engine code so the two paths can't
diverge.

## Environment

All four variables are required in production. Missing env triggers a 500
on the webhook or a hard error from the backfill script.

| Var | Where | Notes |
| :--- | :--- | :--- |
| `FATHOM_WEBHOOK_SECRET` | Fathom dashboard webhook config | Shared with the route; HMAC-SHA256 over the raw body |
| `FATHOM_API_KEY` | Fathom > Settings > Developers | Used by the backfill script; the live webhook does NOT call the API |
| `FATHOM_OPERATOR_EMAILS` | env only | Comma-separated. Used when invitees aren't tagged `is_external` |
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
# Dry run first to confirm the user-mapping looks right.
npm run backfill:fathom -- --dry-run

# Pull every historical recording.
npm run backfill:fathom

# Or cap the date range / count for a smaller test.
npm run backfill:fathom -- --since=2026-01-01 --limit=5
```

The script paginates `/external/v1/meetings` (newest first), skips recordings
where the client invitee email doesn't match any `auth.users` row, and ingests
the rest. Output reports per-recording success and a final tally with skip reasons.

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

The webhook + backfill resolve a client by:

1. Preferring an invitee with `is_external: true` (Fathom's "outside my team" tag).
2. Otherwise dropping anyone in `FATHOM_OPERATOR_EMAILS` and taking the first remaining.
3. Looking up that email in `auth.users` (case-insensitive).
4. Skipping the recording if no user matches.
