/**
 * sections/validation.ts
 *
 * Section 05, Why you can trust it. Spec section 7.5.
 *
 * WHAT THIS SECTION IS FOR. It carries the deterministic-validation
 * differentiator, which is the argument against "isn't this just a chat
 * model?". Spec section 1.3 scopes the word "deterministic" precisely: the
 * engine follows fixed rules and returns the same verdict for the same input.
 * It does not claim the underlying biology is settled. The approved wording is
 * already written and Appendix-B-walked in content/copy.ts, and this module
 * renders it verbatim. No claim is authored here.
 *
 * NO SAFETY CLAIM. Override A6 Q10 omits the biosecurity line entirely, and
 * copy.ts carries no `biosec` key. Nothing in this module renders a safety,
 * screening, clinical or regulatory-status claim of any kind. A false safety
 * claim is the one category of overstatement that does not get forgiven
 * (Appendix B.1).
 *
 * SHAPE, spec section 7.5. Two columns at desktop. Left: the prose, in
 * `.prose` so it holds the 34em measure. Right: a validation report panel
 * rendered from the baked `demo-validation.json`. Below both columns, a
 * full-width strip carrying the gold-set line.
 *
 * WHERE EACH STRING COMES FROM. Row labels, the PASS word and the WARN word
 * come from copy.ts. The per-row reason strings are DATA, not copy: they come
 * from the JSON and spec section 11.11 says they must never be typed into
 * copy.ts. The gold-set line is rendered as one unbroken string, because the
 * section 16.5 lint requires any surviving "100%" to sit within 60 characters
 * of "curated", and reformatting the line could separate the number from its
 * qualifier.
 *
 * PROVENANCE. Per override A6 Q2 no real export exists, so the payload carries
 * a literal `_TODO` key and loading it prints a console WARNING. That is spec
 * section 7.5's rule, inherited from section 8.3: the site must not ship a
 * placeholder silently. It is a warning and never an error, because spec
 * section 16.6 makes console errors a hard build gate and a known, logged
 * placeholder must not fail that gate.
 *
 * ACCESSIBILITY, spec section 13.4. Colour is never the only signal. Every row
 * carries the PASS or WARN word as text. The swatch is decorative and is
 * `aria-hidden`, so no information is conveyed by hue alone.
 *
 * MOTION, spec section 6.2. Rows reveal on enter with a 110ms stagger through
 * `revealGroup`, and each row's status mark follows its own label. These are
 * CSS transitions toggled by IntersectionObserver, never GSAP tweens. This
 * module creates no ScrollTrigger and exports no `initScrub`: a report panel
 * has nothing to scrub, and spec section 6.4 allows triggers to be created in
 * one place only.
 *
 * REDUCED MOTION. Structural. `reveal()` adds the settled class synchronously
 * when reduced motion is on, `revealGroup` collapses its stagger to zero, and
 * the block in sections.css settles everything this section owns under both
 * `.no-motion` and the media query, so nothing here can sit at `opacity: 0`.
 */

import { copy } from '../content/copy';
import { reveal, revealGroup } from '../core/observe';
import { revealWords } from '../fx/splitText';

const c = copy.validation;

/** The baked report. The site never calls a product API (spec 2.2, 7.5). */
const REPORT_URL = '/data/demo-validation.json';

/** Spec section 7.5: rows reveal on enter with a 110ms stagger. */
const ROW_STAGGER_MS = 110;

/** The status mark draws in after its own row's label. */
const MARK_OFFSET_MS = 180;

type CheckStatus = 'PASS' | 'WARN';

type ValidationCheck = {
  id: string;
  status: CheckStatus;
  reason?: string;
};

type ValidationReport = {
  construct?: string;
  checks: ValidationCheck[];
  _TODO?: string;
};

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

/**
 * The BUILD_CONTRACT C5 section head. Numeral, kicker, title, rule, in that
 * order. The numeral is decorative (spec section 13.2) so it is aria-hidden.
 * The title carries the id the shell's `aria-labelledby` already points at.
 */
function buildHead(): { head: HTMLElement; title: HTMLElement } {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'validation-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return { head, title };
}

/**
 * One report row. The label is rendered immediately from copy.ts, so all four
 * rows are legible even if the payload never arrives. The status cell is
 * filled in later from the data.
 */
type Row = {
  item: HTMLElement;
  label: HTMLElement;
  status: HTMLElement;
};

function buildRow(label: string): Row {
  const item = el('li', 'sec-validation__row');
  const labelEl = el('span', 'sec-validation__label reveal', label);
  const status = el('span', 'sec-validation__status');
  item.append(labelEl, status);
  return { item, label: labelEl, status };
}

/**
 * Fill one row's status cell. The swatch is a small square drawn as an inline
 * SVG rect, not a glyph: spec section 2.4 bans emoji, including a tick mark
 * used as a pass symbol. The word beside it is the real carrier of meaning
 * (spec section 13.4), and the swatch is aria-hidden.
 */
function fillStatus(row: Row, check: ValidationCheck): HTMLElement {
  const isWarn = check.status === 'WARN';
  const modifier = isWarn ? 'sec-validation__mark--warn' : 'sec-validation__mark--pass';

  const mark = el('span', 'sec-validation__mark ' + modifier + ' reveal');

  const swatch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  swatch.setAttribute('class', 'sec-validation__swatch');
  swatch.setAttribute('viewBox', '0 0 10 10');
  swatch.setAttribute('width', '10');
  swatch.setAttribute('height', '10');
  swatch.setAttribute('aria-hidden', 'true');
  swatch.setAttribute('focusable', 'false');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0.5');
  rect.setAttribute('y', '0.5');
  rect.setAttribute('width', '9');
  rect.setAttribute('height', '9');
  rect.setAttribute('rx', '1');
  swatch.appendChild(rect);

  // The word. PASS and WARN come from copy.ts, never from the data file.
  const word = el('span', 'sec-validation__word', isWarn ? c.warn : c.pass);

  mark.append(swatch, word);
  row.status.appendChild(mark);

  // The reason is DATA (spec section 11.11). It is only ever shown when the
  // payload supplies one, and it is never synthesised here.
  if (typeof check.reason === 'string' && check.reason.length > 0) {
    const reason = el('span', 'sec-validation__reason', check.reason);
    row.status.appendChild(reason);
  }

  return mark;
}

/**
 * Fetch the baked report.
 *
 * The `_TODO` warning is required by spec section 7.5. It is a console
 * WARNING, never an error, for the reason given in the file header.
 */
function loadReport(): Promise<ValidationReport> {
  return fetch(REPORT_URL)
    .then((res) => {
      if (!res.ok) {
        throw new Error('demo-validation.json responded ' + String(res.status));
      }
      return res.json() as Promise<ValidationReport>;
    })
    .then((report) => {
      if (report && typeof report._TODO === 'string') {
        console.warn(
          '[validation] PLACEHOLDER DATA IN USE. ' +
            REPORT_URL +
            ' carries a "_TODO" key, so the validation report panel is ' +
            'rendering demonstration data, not a real export. Replace the ' +
            'file and delete the key. Note: ' +
            report._TODO,
        );
      }
      return report;
    });
}

export function mount(root: HTMLElement): void {
  root.classList.add('sec-validation');

  const container = el('div', 'container');

  const { head, title } = buildHead();

  /* --- Two columns, spec section 7.5 ------------------------------------ */

  const cols = el('div', 'sec-validation__cols');

  // LEFT: the prose. `.prose` is WP-05's class and carries the 34em measure.
  const prose = el('div', 'prose sec-validation__prose');
  const p1 = el('p', 'sec-validation__para reveal', c.body1);
  const p2 = el('p', 'sec-validation__para reveal', c.body2);
  const p3 = el('p', 'sec-validation__para reveal', c.body3);
  prose.append(p1, p2, p3);

  // RIGHT: the report panel, rendered from the baked payload.
  const panel = el('div', 'sec-validation__panel');
  const list = el('ul', 'sec-validation__rows');
  const rows: Row[] = [];
  for (let i = 0; i < c.rows.length; i += 1) {
    const row = buildRow(c.rows[i].label);
    rows.push(row);
    list.appendChild(row.item);
  }
  panel.appendChild(list);

  cols.append(prose, panel);

  /* --- The gold-set strip, full width beneath both columns --------------- */

  // Rendered as ONE unbroken string, exactly as copy.ts holds it. Splitting it
  // on the separators could put "100%" and "curated" more than 60 characters
  // apart in the rendered text, which is the section 16.5 lint's failure mode
  // and the Appendix B qualifier requirement.
  const strip = el('div', 'sec-validation__goldset reveal');
  const goldset = el('p', 'sec-validation__goldset-line mono', c.goldset);
  strip.appendChild(goldset);

  container.append(head, cols, strip);
  root.appendChild(container);

  /* --- Motion. Everything below runs with the nodes in the document, --- */
  /* --- because an observer pointed at a detached element never fires. --- */

  reveal(head);
  revealWords(title, { staggerMs: 40 });

  reveal(p1);
  reveal(p2, { delay: 70 });
  reveal(p3, { delay: 140 });

  // Spec section 7.5: rows reveal on enter with a 110ms stagger.
  revealGroup(
    rows.map((r) => r.label),
    ROW_STAGGER_MS,
  );

  reveal(strip, { delay: 140 });

  loadReport()
    .then((report) => {
      const checks = Array.isArray(report.checks) ? report.checks : [];
      for (let i = 0; i < rows.length; i += 1) {
        const check = checks[i];
        if (!check) continue;
        const mark = fillStatus(rows[i], check);
        // Each row's status mark draws in after its own label.
        reveal(mark, { delay: i * ROW_STAGGER_MS + MARK_OFFSET_MS });
      }
    })
    .catch((err: unknown) => {
      // A warning, not an error: spec section 16.6 makes console errors a hard
      // build gate. The four row labels are already rendered from copy.ts, so
      // the panel degrades to labels rather than to nothing.
      console.warn('[validation] could not load ' + REPORT_URL + '. ' + String(err));
    });
}
