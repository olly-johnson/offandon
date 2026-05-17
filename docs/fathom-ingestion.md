# Fathom transcript ingestion (BO-061)

Auto-pull every completed Fathom recording into the client corpus and expose
it under `/transcripts` so users can read the transcript directly.

## Wire shape

```
fathom.video
   |   per-recording webhook (HMAC-SHA256)
   v
/api/fathom/webhook  (POST)
   |   - verifies X-Fathom-Signature
   |   - parses payload (recording id, invitees, started_at, share_url)
   |   - picks the client invitee (non-operator)
   |   - resolves user_id by email
   v
inngest event:  fathom/recording.received  { user_id, recording_id, ... }
   |
   v
ingest-fathom-recording inngest fn
   |   - GET /external/v1/recordings/{id}  (Fathom REST, bearer auth)
   |   - chunkText -> Voyage embed (input_type=document)
   |   - upsert client_documents row (source_type=fathom_transcript)
   |   - replace client_document_chunks rows
   v
/transcripts list + /transcripts/{id} detail  (Next.js, RLS-scoped)
```

## Environment

All four variables must be set in production. When any are missing the route
or function logs a warning and returns without writing.

| Var | Where | Notes |
| :--- | :--- | :--- |
| `FATHOM_WEBHOOK_SECRET` | Fathom dashboard webhook config | Shared with the route; HMAC-SHA256 hex over the raw body |
| `FATHOM_API_KEY` | Fathom > Settings > API | Used by the Inngest fn to fetch the transcript |
| `FATHOM_OPERATOR_EMAILS` | env only | Comma-separated. The non-operator invitee is treated as the client |
| `VOYAGE_API_KEY` | Voyage dashboard | Already required by the corpus engine; same key |

## Idempotency

The upsert key is `(user_id, source_path)` with `source_path = fathom://<recording_id>`.
Retries from Fathom or Inngest replay the same recording without producing
duplicates: the document is overwritten and its chunks replaced.

## Operator setup

1. In Fathom > Settings > Integrations > Webhooks, add a webhook pointed at
   `https://<your-domain>/api/fathom/webhook`. Generate a long secret and
   paste it as `FATHOM_WEBHOOK_SECRET` in Vercel.
2. In Fathom > Settings > API, generate a personal API key and paste it as
   `FATHOM_API_KEY` in Vercel.
3. Set `FATHOM_OPERATOR_EMAILS` to your own email(s) on Fathom calls. If
   you record with multiple operators, list all of them.
4. Push a deploy so the route is live. Take a 1-minute test call in
   Fathom and watch the Inngest dashboard for a `fathom/recording.received`
   event followed by an ingest function run.

## Smoke test

Without an actual Fathom call, you can verify the route locally:

```bash
SECRET=$(printf %s "$FATHOM_WEBHOOK_SECRET")
BODY='{"id":"rec_smoke","title":"smoke","started_at":"2026-05-17T10:00:00Z","invitees":[{"email":"client@example.com"}]}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -sS -X POST http://localhost:3000/api/fathom/webhook \
  -H "Content-Type: application/json" \
  -H "X-Fathom-Signature: sha256=$SIG" \
  --data "$BODY"
```

Expected output: `{"ok":true,"recording_id":"rec_smoke"}` if `client@example.com`
exists in `auth.users`, else `{"ok":true,"skipped":true,...}`.

## Mapping rule

The webhook resolves a client by:

1. Reading the invitee list from the payload.
2. Dropping anyone in `FATHOM_OPERATOR_EMAILS` (case-insensitive).
3. Taking the first remaining invitee.
4. Looking that email up in `auth.users`.

Calls where no invitee maps to a known user are returned 200 with
`skipped:true` so Fathom doesn't keep retrying.
