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

## How the client talks to this

`src/contact.ts` posts a `URLSearchParams` body with a normal `fetch`. It does
not set `mode: 'no-cors'`: that makes the response opaque, so the code could
never read the `{ ok: true }` JSON and could never tell success from failure.
`application/x-www-form-urlencoded` is a CORS-simple content type, so there is
no preflight and the common "Apps Script CORS" folklore does not apply.

If the first attempt is unreachable, and only then, the client retries once with
`Content-Type: text/plain;charset=utf-8` and the same URL-encoded body. That
moves the payload out of `e.parameter` and into `e.postData.contents`, which the
script above already parses. A response that says `ok: false` is a final answer
and is never retried, so a rejected send can never become a double send.

If `SCRIPT_URL` is ever emptied, the form still renders but the submit button is
disabled and the status line says the mail line is not wired. That branch exists
so a future edit cannot ship a form that silently drops messages.
