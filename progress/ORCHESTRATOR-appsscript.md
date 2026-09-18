# Apps Script mail relay: deployed

Deployed by the orchestrator via browser, per spec section 10.4.

- Project name: construct-mail-line
- Deployment type: Web app
- Execute as: Me (the site owner's account)
- Who has access: Anyone
- Authorization: completed
- Description: Construct site contact form relay v1

SCRIPT_URL to paste into `src/contact.ts`:

https://script.google.com/macros/s/AKfycbyxRuBGmIk7eipgw7ULSGJaCO8eOvNiC4_SUQyXS_PUb-vcBVdqBxfnLJ8Daqog96npDA/exec

## Verification performed

A real `application/x-www-form-urlencoded` POST was sent to the /exec URL with
name, email, org, subject and message. Response: `{"ok":true}`, HTTP 200.
A GET to the same URL returns "Script function not found: doGet", which confirms
the deployment is live and authorized rather than merely created.

Note for anyone re-testing with curl: use `-L` with `--data-urlencode` and do
NOT add `-X POST` or `--post302`. Apps Script answers with a 302 to a
googleusercontent echo endpoint that must be followed with GET. Forcing POST
across the redirect yields a 411 or a 405, which looks like a broken relay and
is not one.
