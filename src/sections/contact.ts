/**
 * src/sections/contact.ts
 *
 * Section 08: Work with us (spec section 7.9, form spec section 10).
 *
 * Builds the section head, one line of framing copy, the five-field form, the
 * primary submit button and the status line, then hands the form to
 * `initContactForm` for its behaviour. Every string comes from `copy.contact`.
 */

import { copy } from '../content/copy';
import { reveal } from '../core/observe';
import { initContactForm } from '../contact';

const c = copy.contact;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildHead(): HTMLElement {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'contact-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return head;
}

type FieldOptions = {
  id: string;
  name: string;
  label: string;
  required: boolean;
  hint?: string;
};

/**
 * One labelled control plus its hint and its error slot.
 * The label is always a real `<label for>`, never a placeholder.
 */
function buildField(ctrl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, o: FieldOptions): HTMLElement {
  const field = el('div', 'field');

  const label = el('label', 'field__label', o.label);
  label.htmlFor = o.id;

  ctrl.id = o.id;
  ctrl.name = o.name;
  ctrl.className = 'field__control';
  if (o.required) {
    ctrl.required = true;
    ctrl.setAttribute('aria-required', 'true');
  }

  const describedBy: string[] = [];

  let hint: HTMLElement | null = null;
  if (o.hint) {
    hint = el('p', 'field__hint', o.hint);
    hint.id = `${o.id}-hint`;
    describedBy.push(hint.id);
  }

  const error = el('p', 'field__error');
  error.id = `${o.id}-error`;
  describedBy.push(error.id);

  ctrl.setAttribute('aria-describedby', describedBy.join(' '));

  field.append(label, ctrl);
  if (hint) field.appendChild(hint);
  field.appendChild(error);
  return field;
}

function buildForm(): HTMLFormElement {
  const form = el('form', 'form');
  form.noValidate = true;

  const nameInput = el('input');
  nameInput.type = 'text';
  nameInput.autocomplete = 'name';

  const emailInput = el('input');
  emailInput.type = 'email';
  emailInput.autocomplete = 'email';

  const row = el('div', 'form__row');
  row.append(
    buildField(nameInput, { id: 'contact-name', name: 'name', label: c.fields.name, required: true }),
    buildField(emailInput, { id: 'contact-email', name: 'email', label: c.fields.email, required: true }),
  );

  const orgInput = el('input');
  orgInput.type = 'text';
  orgInput.autocomplete = 'organization';
  const orgField = buildField(orgInput, {
    id: 'contact-org',
    name: 'org',
    label: c.fields.org,
    required: false,
    hint: c.fields.orgHint,
  });

  const select = el('select');
  for (let i = 0; i < c.options.length; i += 1) {
    const option = el('option');
    option.value = c.options[i];
    option.textContent = c.options[i];
    select.appendChild(option);
  }
  const subjectField = buildField(select, {
    id: 'contact-subject',
    name: 'subject',
    label: c.fields.subject,
    required: true,
  });

  const textarea = el('textarea');
  textarea.rows = 6;
  const messageField = buildField(textarea, {
    id: 'contact-message',
    name: 'message',
    label: c.fields.message,
    required: true,
  });

  // Honeypot, spec section 10.6. Off screen, unfocusable, hidden from AT.
  const honeypot = el('div', 'form__honeypot');
  honeypot.setAttribute('aria-hidden', 'true');
  const honeyInput = el('input');
  honeyInput.type = 'text';
  honeyInput.name = 'website';
  honeyInput.id = 'contact-website';
  honeyInput.tabIndex = -1;
  honeyInput.autocomplete = 'off';
  honeyInput.setAttribute('aria-hidden', 'true');
  honeypot.appendChild(honeyInput);

  const actions = el('div', 'sec-contact__actions');
  const button = el('button', 'btn btn--primary', c.submit);
  button.type = 'submit';

  const status = el('p', 'form__status');
  status.setAttribute('aria-live', 'polite');

  actions.append(button, status);
  form.append(row, orgField, subjectField, messageField, honeypot, actions);
  return form;
}

export function mount(root: HTMLElement): void {
  root.classList.add('sec-contact');

  const container = el('div', 'container container--narrow');

  const head = buildHead();
  const intro = el('p', 'lede sec-contact__intro reveal', c.intro);
  const form = buildForm();
  form.classList.add('reveal');

  container.append(head, intro, form);
  root.appendChild(container);

  reveal(head);
  reveal(intro, { delay: 60 });
  reveal(form, { delay: 120 });

  initContactForm(form);
}
