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
 * - The documented fallback, used only when the first attempt is unreachable,
 *   is `Content-Type: text/plain;charset=utf-8` carrying the same URL-encoded
 *   string. That moves the payload out of `e.parameter` and into
 *   `e.postData.contents`, which the deployed script already parses.
 *
 * The recipient address is not here and never will be. It lives server-side in
 * the Apps Script `RECIPIENT` constant only.
 */

import { copy } from './content/copy';

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

/** Which POST path actually carried the last successful send. */
export type Transport = 'none' | 'form-encoded' | 'text-plain';

let lastTransport: Transport = 'none';

/** Diagnostic only. Nothing user facing reads this. */
export function getLastTransport(): Transport {
  return lastTransport;
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

type Attempt = 'ok' | 'rejected' | 'unreachable';

/**
 * `rejected` means the relay answered and said no. That is a final answer, so
 * the caller must not retry: retrying a rejection risks sending twice.
 * `unreachable` means the request never produced a readable verdict, which is
 * the only case the text/plain fallback exists for.
 */
async function attempt(url: string, init: RequestInit): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return 'unreachable';
  }
  if (!res.ok) return 'unreachable';
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return 'unreachable';
  }
  if (data && typeof data === 'object' && (data as { ok?: unknown }).ok === true) {
    return 'ok';
  }
  return 'rejected';
}

async function send(body: URLSearchParams): Promise<boolean> {
  const first = await attempt(SCRIPT_URL, { method: 'POST', body });
  if (first === 'ok') {
    lastTransport = 'form-encoded';
    return true;
  }
  if (first === 'rejected') return false;

  const second = await attempt(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body.toString(),
  });
  if (second === 'ok') {
    lastTransport = 'text-plain';
    return true;
  }
  return false;
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

    inFlight = true;
    button.disabled = true;
    button.textContent = copy.contact.pending;
    setStatus(status, copy.contact.pending, true);

    let delivered = false;
    try {
      delivered = await send(body);
    } finally {
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
