# Mail relay: Google Apps Script

The contact form on this site is pure front end. It POSTs its fields to a
Google Apps Script web app, which relays them as email. There is no backend, no
third-party form service, no API key in the client bundle, and no server to
maintain.

```
[browser form] --POST form-encoded--> [Apps Script web app] --MailApp--> [inbox]
```

This file is a runbook, not shipped client code. It is the one place the
recipient address is allowed to appear. That address lives server-side in the
Apps Script project only, and it must never appear in `src/` or in any rendered
string on the site.

---

## Current live state

| Item | Value |
|---|---|
| Project name | `construct-mail-line` |
| Deployment type | Web app |
| Execute as | Me (the account that sends the mail) |
| Who has access | Anyone |
| Authorization | Completed |
| Status | Live and verified |

Web app URL, pasted into the `SCRIPT_URL` constant at the top of
`src/contact.ts`:

```
https://script.google.com/macros/s/AKfycbyxRuBGmIk7eipgw7ULSGJaCO8eOvNiC4_SUQyXS_PUb-vcBVdqBxfnLJ8Daqog96npDA/exec
```

Verified by a real `application/x-www-form-urlencoded` POST carrying name,
email, org, subject and message. Response: `{"ok":true}`, HTTP 200. A GET to
the same URL returns `Script function not found: doGet`, which confirms the
deployment is live and authorized rather than merely created.

---

## The script

`Code.gs` in the project, verbatim.

```javascript
// Where the messages land. Comma-separated for multiple inboxes.
const RECIPIENT = 'markandeyayalamanchi9@gmail.com'

function doPost(e) {
  // Accept both a normal form-encoded POST (e.parameter) and a
  // text/plain POST carrying a URL-encoded body (e.postData.contents).
  // See the §10.5 note: the second path exists only as a fallback and
  // the script must understand it, or the fallback silently drops mail.
  let p = (e && e.parameter) || {}
  if (!p.name && e && e.postData && e.postData.contents) {
    const parsed = {}
    e.postData.contents.split('&').forEach(function (kv) {
      const i = kv.indexOf('=')
      if (i > -1) {
        parsed[decodeURIComponent(kv.slice(0, i))] =
          decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '))
      }
    })
    p = parsed
  }
  const name    = String(p.name    || '').trim()
  const email   = String(p.email   || '').trim()
  const org     = String(p.org     || '').trim()
  const subject = String(p.subject || '').trim()
  const message = String(p.message || '').trim()
  const honey   = String(p.website || '').trim()

  // Honeypot: real humans never fill a hidden field. Pretend success.
  if (honey) {
    return json({ ok: true })
  }

  if (!name || !email || !message) {
    return json({ ok: false, error: 'Missing required fields.' })
  }

  // Cheap per-IP-less rate limit: one send per 20s per email address.
  const cache = CacheService.getScriptCache()
  const key = 'rl_' + email.toLowerCase()
  if (cache.get(key)) {
    return json({ ok: false, error: 'Please wait a moment before sending again.' })
  }
  cache.put(key, '1', 20)

  MailApp.sendEmail({
    to: RECIPIENT,
    replyTo: email,
    subject: 'Construct: ' + (subject || 'message') + ' from ' + name,
    body: [
      'New message from the Construct site:',
      '',
      'Name:         ' + name,
      'Email:        ' + email,
      'Organization: ' + (org || '-'),
      'Subject:      ' + (subject || '-'),
      '',
      'Message:',
      message,
    ].join('\n'),
  })

  return json({ ok: true })
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
```

---

## Deployment runbook

1. Go to script.google.com, signed in as **markandeyayalamanchi9@gmail.com**
   (the account that will send the mail).
2. **New project**, name it `construct-mail-line`.
3. Replace `Code.gs` with the script above. Save.
4. **Deploy, then New deployment**. Gear next to "Select type", then **Web app**.
5. Set **Execute as: Me**. This is what permits `MailApp` to send.
6. Set **Who has access: Anyone**. Required so the site can POST without a
   Google login. The script only ever sends to `RECIPIENT`, so this exposes
   nothing.
7. **Deploy**, then **Authorize access**. It will warn the app is unverified:
   choose *Advanced, then Go to construct-mail-line*. It is your own script.
8. Copy the **Web app URL**, of the form
   `https://script.google.com/macros/s/AKfycb.../exec`.
9. Paste it into the `SCRIPT_URL` constant at the top of `src/contact.ts`.
10. Commit and push. Vercel redeploys.

All ten steps have already been performed. The state they produced is recorded
in the table above.

### Updating later

After editing `Code.gs` you must do **Deploy**, then **Manage deployments**,
then the **pencil** (edit), then **Version: New version**, then **Deploy**.
Saving the file alone does not change the live URL's behaviour. The URL itself
stays the same, so the site needs no change.

### Quota

Consumer Gmail accounts send roughly 100 emails per day via `MailApp`, which is
far beyond what a contact form needs.

---

## Re-testing with curl

Use `-L` with `--data-urlencode`, and do **not** add `-X POST` or `--post302`.

```bash
curl -L \
  --data-urlencode 'name=Relay test' \
  --data-urlencode 'email=someone@example.com' \
  --data-urlencode 'org=Test' \
  --data-urlencode 'subject=Press' \
  --data-urlencode 'message=Relay check.' \
  'https://script.google.com/macros/s/AKfycbyxRuBGmIk7eipgw7ULSGJaCO8eOvNiC4_SUQyXS_PUb-vcBVdqBxfnLJ8Daqog96npDA/exec'
```

Apps Script answers with a 302 to a googleusercontent echo endpoint that must be
followed with GET. Forcing POST across the redirect yields a 411 or a 405, which
looks like a broken relay and is not one. A healthy run prints `{"ok":true}`.

---

## THE 20 SECOND RATE LIMIT IS LOAD BEARING. DO NOT SHORTEN IT.

In the script above, this line

```javascript
cache.put(key, '1', 20)
```

runs immediately **before** `MailApp.sendEmail`. It was written as cheap spam
control. It is now also the server half of the client's duplicate-send
guarantee, and `src/contact.ts` is built against the number 20.

The reasoning, in one paragraph. A browser can lose a response to a request the
server processed anyway: a 404 on the `script.googleusercontent.com` redirect
target, a dropped connection, a CORS-blocked reply. In each of those the mail
has already been sent and the client cannot tell. The client's first defence is
to classify those cases as final and never retry them. Its second defence is
that the one case it does retry, a `fetch` that rejected with no HTTP response
at all, is retried only while less than 8 seconds have passed since the first
POST. If that first POST reached `sendEmail`, the per-address key is sitting in
the script cache for a full 20 seconds, so the retry is answered
`{ ok: false }`, and `ok: false` is final on the client. No second email.

If anyone shortens 20 to, say, 5, that second defence quietly stops holding.
Raising it is safe. Lowering it is not. If it must be lowered, lower
`RETRY_WINDOW_MS` in `src/contact.ts` first, to something comfortably below the
new value.

---

## OPTIONAL HARDENING: per submit idempotency key

**This section REQUIRES A REDEPLOYMENT to take effect. Saving `Code.gs` alone
does nothing.** See "Updating later" above. Nothing on the site depends on it:
the client is safe against duplicates without it, and the extra `key` field it
consumes is already being sent today and is simply ignored by the live script.

What it buys: exact, per submit deduplication rather than per address and per
20 seconds. Both POSTs of one submit carry the same `key`, so the second is
recognised as a repeat and answered `{ ok: true }` without sending. That also
removes the false negative the current design accepts, where a message that was
delivered is reported to the visitor as a failure, and it covers a repeat
arriving after the 20 second window, which the rate limit cannot.

`src/contact.ts` already sends `key` on both attempts of a submit, generated
with `crypto.randomUUID` where it exists.

The full replacement `Code.gs`, verbatim. The only differences from the script
above are the three marked blocks.

```javascript
// Where the messages land. Comma-separated for multiple inboxes.
const RECIPIENT = 'markandeyayalamanchi9@gmail.com'

function doPost(e) {
  // Accept both a normal form-encoded POST (e.parameter) and a
  // text/plain POST carrying a URL-encoded body (e.postData.contents).
  // The second path exists only as a fallback and the script must
  // understand it, or the fallback silently drops mail.
  let p = (e && e.parameter) || {}
  if (!p.name && e && e.postData && e.postData.contents) {
    const parsed = {}
    e.postData.contents.split('&').forEach(function (kv) {
      const i = kv.indexOf('=')
      if (i > -1) {
        parsed[decodeURIComponent(kv.slice(0, i))] =
          decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '))
      }
    })
    p = parsed
  }
  const name    = String(p.name    || '').trim()
  const email   = String(p.email   || '').trim()
  const org     = String(p.org     || '').trim()
  const subject = String(p.subject || '').trim()
  const message = String(p.message || '').trim()
  const honey   = String(p.website || '').trim()
  // CHANGE 1 of 3: read the client's per submit idempotency token.
  const idem    = String(p.key     || '').trim().slice(0, 64)

  // Honeypot: real humans never fill a hidden field. Pretend success.
  if (honey) {
    return json({ ok: true })
  }

  if (!name || !email || !message) {
    return json({ ok: false, error: 'Missing required fields.' })
  }

  const cache = CacheService.getScriptCache()

  // CHANGE 2 of 3: if this exact submit was already accepted, answer the
  // same way again and send nothing. This is what makes a lost response
  // safe to retry: the retry carries the same key.
  let idemKey = ''
  if (idem) {
    idemKey = 'idem_' + idem
    if (cache.get(idemKey)) {
      return json({ ok: true })
    }
    // Claimed BEFORE sending, so a retry that overlaps the send is covered
    // too. Ten minutes is far longer than any client will wait.
    cache.put(idemKey, '1', 600)
  }

  // Cheap per-IP-less rate limit: one send per 20s per email address.
  // Still load bearing for any client that sends no key. Do not shorten it.
  const key = 'rl_' + email.toLowerCase()
  if (cache.get(key)) {
    return json({ ok: false, error: 'Please wait a moment before sending again.' })
  }
  cache.put(key, '1', 20)

  try {
    MailApp.sendEmail({
      to: RECIPIENT,
      replyTo: email,
      subject: 'Construct: ' + (subject || 'message') + ' from ' + name,
      body: [
        'New message from the Construct site:',
        '',
        'Name:         ' + name,
        'Email:        ' + email,
        'Organization: ' + (org || '-'),
        'Subject:      ' + (subject || '-'),
        '',
        'Message:',
        message,
      ].join('\n'),
    })
  } catch (err) {
    // CHANGE 3 of 3: the send failed, so release the claim. Otherwise a
    // genuine retry of a message that never went out would be swallowed.
    if (idemKey) cache.remove(idemKey)
    throw err
  }

  return json({ ok: true })
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
```

To put it live: open the project, replace `Code.gs`, Save, then **Deploy**,
**Manage deployments**, the **pencil**, **Version: New version**, **Deploy**.
The web app URL does not change, so `src/contact.ts` needs no edit. Re-run the
curl check above afterwards and confirm it still prints `{"ok":true}`.

---

## How the client talks to this

`src/contact.ts` posts a `URLSearchParams` body with a normal `fetch`. It does
not set `mode: 'no-cors'`: that makes the response opaque, so the code could
never read the `{ ok: true }` JSON and could never tell success from failure.
`application/x-www-form-urlencoded` is a CORS-simple content type, so there is
no preflight and the common "Apps Script CORS" folklore does not apply.

The client gives every POST one of five verdicts, and only one of them can lead
to a second POST.

| Verdict | What it means | Retried? |
|---|---|---|
| `ok` | the relay answered `{ ok: true }` | done |
| `rejected` | the relay answered and said no | **never**, a rejection is final |
| `answered` | an HTTP response arrived but carried no readable `ok`, for example a 404 from the redirect target | **never**, `doPost` ran and may have sent |
| `timed-out` | the client's own 30 second deadline fired | **never**, the server may still be working |
| `no-response` | `fetch` rejected with no HTTP response at all | once, with `text/plain`, and only inside 8 seconds |

An HTTP response of any status proves the POST reached Apps Script and that
`doPost` ran, because the 302 is only issued after `doPost` returns. That is
why `answered` is final. The earlier implementation collapsed `answered` into
"never arrived" and retried it, which is the defect this package removed.

The `text/plain;charset=utf-8` retry moves the payload out of `e.parameter` and
into `e.postData.contents`, which the script above already parses. It is the
documented fallback and it is still here, unchanged in shape. What changed is
that it can no longer fire on a case where the mail may already have gone out.

The whole submit is bounded by a 30 second deadline, so the button can never
spin indefinitely. Thirty seconds is deliberately generous: this relay has been
measured confirming as slowly as 18 seconds, and aborting a request that was
about to succeed turns a delivered message into a reported failure and invites
the visitor to send a second one by hand. A hairline progress rule beneath the
button fills over that deadline so the wait reads as bounded rather than hung.
It is `aria-hidden`; the `aria-live` status line remains the announced channel
and carries no new string.

On failure of any kind the visitor's typed fields are left populated, so a
message is never lost.

If `SCRIPT_URL` is ever emptied, the form still renders but the submit button is
disabled and the status line says the mail line is not wired. That branch exists
so a future edit cannot ship a form that silently drops messages.
