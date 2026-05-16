# Weekly check-in setup

The weekly check-in loop (BO-057..BO-060) wires a Google Form to Bot OS so
every Friday the cohort gets the same questionnaire, every Saturday
stragglers get a reminder, and every submission folds straight into the
user's Voice DNA.

```
   Inngest cron (Fri/Sat 01:00 UTC)
            |
            v
   Resend  -- weekly questionnaire --> creator inbox
                                              |
                                              v (creator fills it in)
                                       Google Form
                                              |
                            (Apps Script onFormSubmit, HMAC-signed)
                                              |
                                              v
       /api/weekly-checkin/webhook --> weekly_checkins row
                                              |
                                              v
                       voice/dna.refresh.requested (Inngest)
                                              |
                                              v
                        refreshVoiceDna regenerates voice_dna
```

## 1. Create the form

The Python helper does this in one shot. It also writes
`WEEKLY_CHECKIN_FORM_ID` and `WEEKLY_CHECKIN_FORM_URL` to `.env`.

```
python examples/create_weekly_checkin_form.py
```

## 2. Set env vars

In Vercel (and locally in `.env.local`):

| Name | Value |
| :--- | :--- |
| `RESEND_API_KEY` | From resend.com -> API Keys. Required for real sends. |
| `EMAIL_FROM` | e.g. `Off&On <weekly@yourdomain.com>` — must be a verified Resend sender. |
| `WEEKLY_CHECKIN_FORM_URL` | Public viewform URL (written by the Python script). |
| `WEEKLY_CHECKIN_WEBHOOK_SECRET` | Long random string; the Apps Script signs body with this. |

When `RESEND_API_KEY` or `EMAIL_FROM` is unset the email client falls back
to a dry-run that logs every send and discards it; the crons stay safe
on preview branches.

## 3. Attach the Apps Script

In the form's edit view: **Extensions > Apps Script**. Paste the script
below, then under **Project Settings > Script properties** add:

| Property | Value |
| :--- | :--- |
| `WEBHOOK_URL` | `https://<your-deploy>/api/weekly-checkin/webhook` |
| `WEBHOOK_SECRET` | Same string as `WEEKLY_CHECKIN_WEBHOOK_SECRET` above. |

Then **Triggers > Add Trigger**: function `onFormSubmit`, event source
**From form**, event type **On form submit**.

```javascript
function onFormSubmit(e) {
  var url = PropertiesService.getScriptProperties().getProperty('WEBHOOK_URL');
  var secret = PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET');
  if (!url || !secret) {
    Logger.log('WEBHOOK_URL or WEBHOOK_SECRET not set; aborting');
    return;
  }

  var response = e.response;
  var respondentEmail = (response.getRespondentEmail() || '').toLowerCase().trim();
  if (!respondentEmail) {
    Logger.log('no respondent email on submission; aborting');
    return;
  }

  var answers = {};
  var itemResponses = response.getItemResponses();
  for (var i = 0; i < itemResponses.length; i++) {
    var ir = itemResponses[i];
    var title = ir.getItem().getTitle();
    var raw = ir.getResponse();
    answers[title] = Array.isArray(raw) ? raw.join(', ') : String(raw == null ? '' : raw);
  }

  var payload = {
    respondentEmail: respondentEmail,
    submittedAt: response.getTimestamp().toISOString(),
    answers: answers
  };
  var body = JSON.stringify(payload);
  var signature = 'sha256=' + computeHmacHex(secret, body);

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Off-On-Signature': signature },
    payload: body,
    muteHttpExceptions: true
  };

  var result = UrlFetchApp.fetch(url, options);
  Logger.log('webhook %s -> %s', url, result.getResponseCode());
}

function computeHmacHex(secret, body) {
  var bytes = Utilities.computeHmacSha256Signature(body, secret);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b < 0) b += 256;
    var h = b.toString(16);
    hex += (h.length === 1 ? '0' + h : h);
  }
  return hex;
}
```

The form MUST be configured to **collect respondent emails** (Settings >
Responses > Collect email addresses = ON), since the webhook resolves
the user by email.

## 4. Verify

Submit a test response yourself. You should see:

1. In Vercel logs, `api.weekly-checkin.webhook` log line `checkin saved + refresh emitted`.
2. A row in `public.weekly_checkins` with `user_id = your auth.users.id`.
3. An Inngest run of `Voice DNA: weekly refresh` finishing with `voice dna refreshed`.
4. A new active row in `public.voice_dna` superseding the previous one.

If the webhook returns 401, check that the Script properties secret
exactly matches `WEEKLY_CHECKIN_WEBHOOK_SECRET`. If it returns 400 with
`unknown respondent`, the email on the auth.users row doesn't match the
respondent email; invite that user via /admin/invite first.

## Schedules

Both crons run on UTC. Bali (WITA) is UTC+8, so the schedules below
fire at 09:00 Bali:

| Cron | UTC | Local (Bali) |
| :--- | :--- | :--- |
| `weekly-checkin-send` | `0 1 * * 5` | Fri 09:00 |
| `weekly-checkin-reminder` | `0 1 * * 6` | Sat 09:00 |

The reminder queries `weekly_checkins` for rows whose `week_start` is the
ISO Monday of Saturday-morning-UTC, so the reminder cohort is exactly
"didn't submit this week".
