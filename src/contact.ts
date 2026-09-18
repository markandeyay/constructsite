/**
 * src/contact.ts
 *
 * Contact form submit logic (spec section 10.5). The markup this drives is
 * built by `src/sections/contact.ts`; this module only wires behaviour onto an
 * already-mounted `<form class="form">`.
 *
 * Transport notes, because the folklore around this is wrong:
 *
 * - The body is a `URLSearchParams`, posted with a normal `fetch`. We do NOT
 *   set `mode: 'no-cors'`. That would make the response opaque, so this code
 *   could never read the `{ ok: true }` JSON and could never tell a delivered
 *   message from a dropped one.
 * - `application/x-www-form-urlencoded` is a CORS-simple content type, so the
 *   request triggers no preflight. An Apps Script web app deployed to "Anyone"
 *   answers with a permissive `Access-Control-Allow-Origin` and the JSON reads
 *   back normally.
 * - The documented fallback is `Content-Type: text/plain;charset=utf-8`
 *   carrying the same URL-encoded string. That moves the payload out of
 *   `e.parameter` and into `e.postData.contents`, which the deployed script
 *   already parses. It is still here, and it is now time boxed. See below.
 *
 * ---------------------------------------------------------------------------
 * WHY A SECOND POST CANNOT PRODUCE A SECOND EMAIL
 * ---------------------------------------------------------------------------
 *
 * The original implementation collapsed every non-success into one verdict,
 * `unreachable`, and retried all of them. That was wrong, and it was observed
 * to be wrong: a 404 from the `script.googleusercontent.com` redirect target
 * produced `res.ok === false`, which was treated as "never arrived" and
 * retried. But an HTTP response of ANY status proves the POST reached Apps
 * Script and that `doPost` ran to completion, because the 302 is only issued
 * after `doPost` returns. The mail had already been sent. The retry was a
 * second send in waiting.
 *
 * The fix is two independent guarantees, either of which is sufficient.
 *
 * 1. CLASSIFY, DO NOT LUMP. An attempt now returns one of five verdicts, and
 *    only ONE of them is retryable. `answered` (an HTTP response arrived but
 *    carried no readable `ok`), `rejected` (the relay said no) and `timed-out`
 *    (our own deadline fired while the request was still outstanding) are all
 *    final. Each of them means the server may have done the work, so retrying
 *    would risk a duplicate. Only `no-response`, where `fetch` itself rejected
 *    and no HTTP response ever existed, is a candidate for the fallback.
 *
 * 2. STAY INSIDE THE SERVER'S DEDUPE WINDOW. Even `no-response` is not proof
 *    that nothing happened: a CORS-blocked response is a rejected `fetch` over
 *    a request the server did process. So the fallback is additionally time
 *    boxed. The deployed `doPost` calls `cache.put('rl_' + email, '1', 20)`
 *    immediately BEFORE `MailApp.sendEmail`, so if the first POST got far
 *    enough to send mail, the server holds a per-address key for the next 20
 *    seconds and answers a repeat with `{ ok: false }`, which this client
 *    treats as final and never retries. The fallback is therefore issued only
 *    while `elapsed < RETRY_WINDOW_MS`, which is far inside that window. The
 *    worst case is a false negative (a message that was delivered reported as
 *    a failure), never a duplicate.
 *
 *    That coupling is load bearing. `APPS_SCRIPT_SETUP.md` says so next to the
 *    rate limit, so nobody shortens it to 5 seconds thinking it is only spam
 *    control.
 *
 * Belt and braces: every submit attempt also carries a `key`, a per attempt
 * idempotency token sent identically on both POSTs. The currently deployed
 * script ignores unknown fields, so this is inert today. `APPS_SCRIPT_SETUP.md`
 * carries an optional hardened `Code.gs` that consumes it for exact per submit
 * dedupe. That script REQUIRES A REDEPLOYMENT to take effect and this client
 * does not depend on it.
 *
 * The recipient address is not here and never will be. It lives server-side in
 * the Apps Script `RECIPIENT` constant only.
 */

import { copy } from './content/copy';
import { prefersReducedMotion } from './core/motion';

/**
 * The deployed Apps Script web app `/exec` URL.
 * Empty string means the mail line is not wired: the form still renders, but
 * the submit button is disabled and the status line says so, rather than
 * silently dropping messages.
 */
const SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyxRuBGmIk7eipgw7ULSGJaCO8eOvNiC4_SUQyXS_PUb-vcBVdqBxfnLJ8Daqog96npDA/exec';

/** Mirrors the server rule: a basic shape check, not an RFC parser. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Hard cap on one submit, both attempts included. The button can never spin
 * past this. Apps Script has been measured as slow as 18 seconds to confirm on
 * this relay, so the cap is generous on purpose: aborting a request that was
 * about to succeed turns a delivered message into a reported failure, and
 * invites the user to send a second one by hand.
 */
export const SEND_DEADLINE_MS = 30000;

/**
 * The fallback POST is issued only while less than this much time has passed
 * since the first POST left the browser. The deployed relay holds a 20 second
 * per-address key that it sets before sending, so any repeat inside that
 * window is answered `ok: false` and stops. 8 seconds leaves 12 seconds of
 * margin for clock skew and for the round trip of the retry itself.
 */
export const RETRY_WINDOW_MS = 8000;

/** The lifetime of the server-side per-address key, for the assertion below. */
const SERVER_DEDUPE_MS = 20000;

// A compile-time reminder that the two constants above are related. If anyone
// widens the retry window past the server's dedupe window, the safety argument
// in the header comment stops holding.
const RETRY_WINDOW_IS_INSIDE_SERVER_DEDUPE: boolean = RETRY_WINDOW_MS < SERVER_DEDUPE_MS;

/** Which POST path actually carried the last successful send. */
export type Transport = 'none' | 'form-encoded' | 'text-plain';

let lastTransport: Transport = 'none';

/** Diagnostic only. Nothing user facing reads this. */
export function getLastTransport(): Transport {
  return lastTransport;
}

/**
 * The outcome of a single POST.
 *
 * - `ok`          the relay answered `{ ok: true }`. Delivered.
 * - `rejected`    the relay answered and said no (validation, rate limit).
 *                 Final. Retrying a rejection is how a rejection becomes a
 *                 duplicate.
 * - `answered`    an HTTP response came back but carried no readable verdict:
 *                 a non-2xx status, or a body that is not the expected JSON.
 *                 `doPost` ran. Final.
 * - `timed-out`   our own deadline fired with the request still outstanding.
 *                 The server may still be working. Final.
 * - `no-response` `fetch` rejected without an HTTP response. The only verdict
 *                 the fallback exists for, and even then only inside
 *                 `RETRY_WINDOW_MS`.
 */
export type Verdict = 'ok' | 'rejected' | 'answered' | 'timed-out' | 'no-response';

let lastVerdicts: Verdict[] = [];

/** Diagnostic only. Nothing user facing reads this. */
export function getLastVerdicts(): readonly Verdict[] {
  return lastVerdicts;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function control(form: HTMLFormElement, name: string): Control | null {
  const found = form.elements.namedItem(name);
  if (
    found instanceof HTMLInputElement ||
    found instanceof HTMLTextAreaElement ||
    found instanceof HTMLSelectElement
  ) {
    return found;
  }
  return null;
}

function setError(ctrl: Control, message: string): void {
  const field = ctrl.closest('.field');
  const slot = field ? field.querySelector<HTMLElement>('.field__error') : null;
  if (slot) slot.textContent = message;
  if (message) {
    ctrl.setAttribute('aria-invalid', 'true');
  } else {
    ctrl.removeAttribute('aria-invalid');
  }
}

/**
 * Write the status line. `pending` appends three dot spans whose opacity is
 * animated by CSS, so the announced text stays stable while the ellipsis
 * moves. Under reduced motion the dots simply sit still.
 */
function setStatus(el: HTMLElement, text: string, pending = false): void {
  el.textContent = text;
  if (!pending) return;
  const dots = document.createElement('span');
  dots.className = 'sec-contact__dots';
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'sec-contact__dot';
    dot.textContent = '.';
    dots.appendChild(dot);
  }
  el.appendChild(dots);
}

/**
 * A per attempt idempotency token. `crypto.randomUUID` where it exists, a
 * time plus random string everywhere else. Only ever used as an opaque key.
 */
function idempotencyKey(): string {
  const c: Crypto | undefined = typeof crypto === 'undefined' ? undefined : crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Drives the determinate progress rule beneath the button, so an eighteen
 * second wait reads as a bounded wait rather than a hang. The element is
 * `aria-hidden`: the status line is the announced channel and it carries no
 * new string. Returns a stop function.
 *
 * Under reduced motion there is no continuous transition. The rule steps in
 * quarters instead, which conveys the same bound without sustained movement.
 */
function startProgress(track: HTMLElement | null, deadlineMs: number): () => void {
  if (!track) return () => undefined;
  const bar = track.querySelector<HTMLElement>('.sec-contact__progress-bar');
  if (!bar) return () => undefined;

  const timers: number[] = [];
  const reduced = prefersReducedMotion();

  bar.style.transition = 'none';
  bar.style.transform = 'scaleX(0)';
  track.classList.add('is-running');
  // Force a style flush so the reset above is not coalesced with the growth.
  void track.offsetWidth;

  if (reduced) {
    for (let step = 1; step <= 4; step += 1) {
      timers.push(
        window.setTimeout(() => {
          bar.style.transform = `scaleX(${step / 4})`;
        }, (deadlineMs / 4) * step),
      );
    }
  } else {
    bar.style.transition = `transform ${deadlineMs}ms linear`;
    bar.style.transform = 'scaleX(1)';
  }

  return () => {
    for (let i = 0; i < timers.length; i += 1) window.clearTimeout(timers[i]);
    track.classList.remove('is-running');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
  };
}

/**
 * One POST. Never throws. `signal` carries the submit-wide deadline, so an
 * abort is reported as `timed-out` rather than mistaken for a transport
 * failure, which is the difference between "may have sent" and "did not send".
 */
async function attempt(url: string, init: RequestInit, signal: AbortSignal): Promise<Verdict> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch {
    // An abort and a transport failure both land here. Only the signal can
    // tell them apart, and they are NOT the same verdict.
    return signal.aborted ? 'timed-out' : 'no-response';
  }

  // From here on an HTTP response exists, which proves the request reached
  // Apps Script and that doPost ran. Nothing below may return a retryable
  // verdict, whatever the status or the body turns out to be.
  if (!res.ok) return 'answered';

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return signal.aborted ? 'timed-out' : 'answered';
  }

  if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
    return 'ok';
  }
  return 'rejected';
}

/**
 * Issue the submit. At most two POSTs leave the browser, and the second one is
 * only ever issued when the first produced no HTTP response at all AND the
 * server's dedupe window is still open. See the header comment.
 */
async function send(body: URLSearchParams): Promise<boolean> {
  const controller = new AbortController();
  const deadline = window.setTimeout(() => controller.abort(), SEND_DEADLINE_MS);
  const startedAt = Date.now();
  lastVerdicts = [];
  lastTransport = 'none';

  try {
    const first = await attempt(SCRIPT_URL, { method: 'POST', body }, controller.signal);
    lastVerdicts.push(first);

    if (first === 'ok') {
      lastTransport = 'form-encoded';
      return true;
    }

    // `rejected`, `answered` and `timed-out` are all final. Each of them is a
    // case where the send may already have happened, so a retry here is
    // exactly the duplicate this package exists to remove.
    if (first !== 'no-response') return false;

    const elapsed = Date.now() - startedAt;
    if (!RETRY_WINDOW_IS_INSIDE_SERVER_DEDUPE || elapsed >= RETRY_WINDOW_MS) {
      // Too late to lean on the server's per-address key. Report honestly
      // rather than gamble a second email.
      return false;
    }

    const second = await attempt(
      SCRIPT_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body.toString(),
      },
      controller.signal,
    );
    lastVerdicts.push(second);

    if (second === 'ok') {
      lastTransport = 'text-plain';
      return true;
    }
    return false;
  } finally {
    window.clearTimeout(deadline);
  }
}

/**
 * Wire an already-built contact form. Safe to call once per form element.
 */
export function initContactForm(form: HTMLFormElement): void {
  const statusFound = form.querySelector<HTMLElement>('.form__status');
  const buttonFound = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const nameFound = control(form, 'name');
  const emailFound = control(form, 'email');
  const orgFound = control(form, 'org');
  const subjectFound = control(form, 'subject');
  const messageFound = control(form, 'message');
  const honeyFound = control(form, 'website');

  if (
    !statusFound ||
    !buttonFound ||
    !nameFound ||
    !emailFound ||
    !orgFound ||
    !subjectFound ||
    !messageFound ||
    !honeyFound
  ) {
    return;
  }

  // Re-bound as non-null so the closures below need no assertions.
  const status: HTMLElement = statusFound;
  const button: HTMLButtonElement = buttonFound;
  const nameEl: Control = nameFound;
  const emailEl: Control = emailFound;
  const orgEl: Control = orgFound;
  const subjectEl: Control = subjectFound;
  const messageEl: Control = messageFound;
  const honeyEl: Control = honeyFound;
  const progress = form.querySelector<HTMLElement>('.sec-contact__progress');

  // Spec section 10.5: an empty SCRIPT_URL must never reach a user as a form
  // that appears to work. Disable it and say so.
  if (!SCRIPT_URL) {
    button.disabled = true;
    setStatus(status, copy.contact.unwired);
    return;
  }

  const restLabel = button.textContent ?? copy.contact.submit;
  const required: Control[] = [nameEl, emailEl, messageEl];

  for (let i = 0; i < required.length; i += 1) {
    const ctrl = required[i];
    ctrl.addEventListener('input', () => {
      if (ctrl.getAttribute('aria-invalid') === 'true') setError(ctrl, '');
    });
  }

  /** Returns the first error message, or an empty string when everything passes. */
  function validate(): string {
    let first = '';
    const req = copy.contact.errors.required;

    const nameValue = nameEl.value.trim();
    const emailValue = emailEl.value.trim();
    const messageValue = messageEl.value.trim();

    if (!nameValue) {
      setError(nameEl, req);
      if (!first) first = req;
    } else {
      setError(nameEl, '');
    }

    if (!emailValue) {
      setError(emailEl, req);
      if (!first) first = req;
    } else if (!EMAIL_PATTERN.test(emailValue)) {
      setError(emailEl, copy.contact.errors.email);
      if (!first) first = copy.contact.errors.email;
    } else {
      setError(emailEl, '');
    }

    if (!messageValue) {
      setError(messageEl, req);
      if (!first) first = req;
    } else {
      setError(messageEl, '');
    }

    return first;
  }

  function focusFirstInvalid(): void {
    const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) invalid.focus();
  }

  function clearFields(): void {
    nameEl.value = '';
    emailEl.value = '';
    orgEl.value = '';
    messageEl.value = '';
    if (subjectEl instanceof HTMLSelectElement) subjectEl.selectedIndex = 0;
    for (let i = 0; i < required.length; i += 1) setError(required[i], '');
  }

  let inFlight = false;

  async function submit(): Promise<void> {
    const problem = validate();
    if (problem) {
      setStatus(status, problem);
      focusFirstInvalid();
      return;
    }

    const sentTo = emailEl.value.trim();
    const body = new URLSearchParams();
    body.set('name', nameEl.value.trim());
    body.set('email', sentTo);
    body.set('org', orgEl.value.trim());
    body.set('subject', subjectEl.value);
    body.set('message', messageEl.value.trim());
    body.set('website', honeyEl.value);
    // Identical on both POSTs of this submit, so a hardened relay can collapse
    // them. Inert against the relay deployed today.
    body.set('key', idempotencyKey());

    // Single flight. The guard is set before the first await, so a second
    // submit event cannot interleave.
    inFlight = true;
    button.disabled = true;
    button.textContent = copy.contact.pending;
    setStatus(status, copy.contact.pending, true);
    const stopProgress = startProgress(progress, SEND_DEADLINE_MS);

    let delivered = false;
    try {
      delivered = await send(body);
    } finally {
      stopProgress();
      inFlight = false;
      button.disabled = false;
      button.textContent = restLabel;
    }

    if (delivered) {
      setStatus(status, copy.contact.success.replace('{email}', sentTo));
      clearFields();
      return;
    }

    // Never lose the message: the fields keep everything the user typed.
    setStatus(status, copy.contact.error);
  }

  form.addEventListener('submit', (event: Event) => {
    event.preventDefault();
    if (inFlight) return;
    void submit();
  });
}
