/**
 * src/sections/how.ts
 *
 * Section 03: How it works (spec section 7.3).
 *
 * THE ONE PINNED SECTION ON THE PAGE, and desktop only, 901px and above.
 *
 * Two variants, one DOM tree.
 *
 *   STAGED (901px and up, reduced motion off, and only once `initScrub` has
 *   run): the inner block pins for five viewport heights. The left column is
 *   the five-step list, the active step carrying `--ink` text and a 2px
 *   `--accent` left border while the rest sit at `--ink-faint`. The right
 *   column is a persistent diagram whose five states are stacked in place, one
 *   visible at a time, advancing with scroll progress.
 *
 *   STACKED (everything else): the five steps render as a vertical stack of
 *   five cards, each with its own static visual, each revealing on enter.
 *   Spec section 7.3 is explicit that this is not a degraded experience but a
 *   different and correct one, and spec section 13.1 makes it the reduced
 *   motion rendering too, so no step can ever become unreachable.
 *
 * WHY THE `sec-how--staged` CLASS EXISTS. Every rule that can put an element
 * at `opacity: 0` in this section is gated on that class, and that class is
 * added at exactly one place in this file: inside `initScrub`, which only
 * `main.ts` calls, and only from the single `gsap.matchMedia()` block whose
 * query already carries both the 901px gate and the reduced-motion gate. If
 * the scrub never runs, for any reason, every step is visible. Spec section
 * 19's "nothing sits at opacity 0 with reduced motion on" is therefore
 * structural here, not lucky.
 *
 * WHAT THIS FILE MUST NOT DO (spec section 6.4). It must not call `initScrub`
 * itself, and it must not create a `gsap.matchMedia()` block or any
 * ScrollTrigger at module scope or inside `mount`. ScrollTrigger measures start
 * positions at creation time, so a pin created out of document order measures
 * against a document that does not yet hold the other spacers. Ordering is
 * WP-10's, from one place.
 *
 * Every user-facing string comes from `copy.ts`.
 */

import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { copy } from '../content/copy';
import { observeOnce, reveal } from '../core/observe';
import { mountPlasmid } from '../fx/plasmid';
import { revealWords } from '../fx/splitText';

const c = copy.how;

/** Spec section 7.3: five steps, and the pin runs for five viewport heights. */
const STEP_COUNT = 5;

/**
 * Fraction of each step's scroll band spent animating. The remainder holds the
 * finished state, so a step is legible for a moment before the next one takes
 * over rather than flipping on the last pixel.
 */
const BAND_ACTIVE = 0.72;

const STAGED = 'sec-how--staged';
const STEP_ACTIVE = 'sec-how__step--active';
const VIS_ON = 'sec-how__vis--on';
const PART_IN = 'sec-how__part--in';

type StepRefs = {
  step: HTMLElement;
  vis: HTMLElement;
  /** Children that come in one at a time across the step's band. */
  parts: HTMLElement[];
  /** Step 1 only: the mono prompt that types out, scrubbed by scroll. */
  typeTarget: HTMLElement | null;
  typeText: string;
};

let rootEl: HTMLElement | null = null;
let refs: StepRefs[] = [];
/** Last written value per step, so an unchanged frame writes nothing. */
let lastShown: number[] = [];
let lastIndex = -1;

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

/* ---------------------------------------------------------------------------
   Section head, BUILD_CONTRACT C5
   ------------------------------------------------------------------------- */

function buildHead(): HTMLElement {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'how-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);

  // Spec section 5.5: the title reveals per word at a 40ms stagger. WP-08 owns
  // the hidden state and every reduced-motion guard around it, so nothing here
  // writes an opacity onto the title. The call comes last, because it rebuilds
  // the element's children.
  revealWords(title, { staggerMs: 40 });

  return head;
}

/* ---------------------------------------------------------------------------
   The five visual states, spec section 7.3
   ------------------------------------------------------------------------- */

/**
 * 1. Describe. A prompt string types out in mono.
 *
 * This is the ONE permitted typing effect on the entire site, and it is
 * scrubbed by scroll, never timed (spec section 2.4 bans animated typing
 * everywhere else). The string is `copy.how.steps[0].line`, because
 * `copy.how` carries no dedicated prompt key: see the cross-WP request in
 * PROGRESS.md.
 *
 * The whole visual is `aria-hidden` because it repeats, character for
 * character, the step line already present in the left column.
 */
function buildDescribe(vis: HTMLElement): { typeTarget: HTMLElement; typeText: string } {
  vis.setAttribute('aria-hidden', 'true');

  const shell = el('div', 'sec-how__prompt');
  const text = el('span', 'sec-how__prompt-text', c.steps[0].line);

  shell.appendChild(text);
  vis.appendChild(shell);

  return { typeTarget: text, typeText: c.steps[0].line };
}

/**
 * 2. Retrieve. Three record cards slide in and stack.
 *
 * The cards are diagrammatic, not textual: hairline bars standing in for the
 * fields of a retrieved record. Nothing here invents a string, and the whole
 * group is `aria-hidden` because it carries no information the step line does
 * not already give in words.
 */
function buildRetrieve(vis: HTMLElement): HTMLElement[] {
  vis.setAttribute('aria-hidden', 'true');

  const stack = el('div', 'sec-how__records');
  const parts: HTMLElement[] = [];
  const widths = [
    ['62%', '86%', '40%'],
    ['74%', '52%', '64%'],
    ['48%', '80%', '58%'],
  ];

  for (let i = 0; i < widths.length; i += 1) {
    const card = el('div', 'sec-how__record sec-how__part');
    for (let j = 0; j < widths[i].length; j += 1) {
      const bar = el('span', 'sec-how__bar');
      bar.style.inlineSize = widths[i][j];
      card.appendChild(bar);
    }
    stack.appendChild(card);
    parts.push(card);
  }

  vis.appendChild(stack);
  return parts;
}

/**
 * 3. Generate. The plasmid map draws from the stacked records.
 *
 * `fx/plasmid.ts` owns the map. The container carries `fx-plasmid` in the
 * markup before `mountPlasmid` runs, which is what reserves its
 * aspect-ratio box: this is the pinned section, and media that loads after
 * measurement makes the pinned distance stale and every trigger below it
 * wrong (spec section 7.3). The mount is deferred until the section is near
 * the viewport, and it cannot shift layout when it lands because the box is
 * already there.
 */
function buildGenerate(vis: HTMLElement): void {
  // BOTH classes belong in the markup, not just `fx-plasmid`. `fx-plasmid`
  // reserves the aspect-ratio box and `fx-plasmid--mini` sets its width, and
  // `mountPlasmid` would otherwise add the modifier itself at mount time: the
  // box would be laid out at the full 560px and collapse to 320px after first
  // paint. That reflow currently scores no CLS only because scroll anchoring
  // absorbs it, which is luck rather than correctness, and it is the same
  // defect class as the containing-block flip fixed earlier in this section.
  // Both classes here means the box is right from the first frame.
  const box = el('div', 'fx-plasmid fx-plasmid--mini sec-how__map');
  vis.appendChild(box);

  observeOnce(
    vis,
    () => {
      void mountPlasmid(box, { mini: true }).catch(() => {
        /* the map is a diagram: a failure to mount it must never reject */
      });
    },
    '400px',
  );
}

/** A drawn pass mark. Decorative: the row label is the text. */
function passMark(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sec-how__mark');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M3 8.6 L6.4 12 L13 4.6');
  path.setAttribute('fill', 'none');
  svg.appendChild(path);

  return svg;
}

/**
 * 4. Validate. Checks tick down a list, each with a pass mark.
 *
 * The check labels are `copy.validation.rows`, which is where those four
 * strings live. No label is written here.
 */
function buildValidate(vis: HTMLElement): HTMLElement[] {
  const list = el('ul', 'sec-how__checks');
  const parts: HTMLElement[] = [];
  const rows = copy.validation.rows;

  for (let i = 0; i < rows.length; i += 1) {
    const row = el('li', 'sec-how__check sec-how__part');
    row.append(passMark(), el('span', 'sec-how__check-label', rows[i].label));
    list.appendChild(row);
    parts.push(row);
  }

  vis.appendChild(list);
  return parts;
}

/** 5. Export. File chips appear, from `copy.how.chip1`, `chip2` and `chip3`. */
function buildExport(vis: HTMLElement): HTMLElement[] {
  const wrap = el('div', 'sec-how__chips');
  const parts: HTMLElement[] = [];
  const labels = [c.chip1, c.chip2, c.chip3];

  for (let i = 0; i < labels.length; i += 1) {
    const chip = el('span', 'sec-how__chip sec-how__part', labels[i]);
    wrap.appendChild(chip);
    parts.push(chip);
  }

  vis.appendChild(wrap);
  return parts;
}

/* ---------------------------------------------------------------------------
   mount
   ------------------------------------------------------------------------- */

export function mount(root: HTMLElement): void {
  rootEl = root;
  root.classList.add('sec-how');

  const inner = el('div', 'sec-how__inner');
  const container = el('div', 'container');
  const body = el('div', 'sec-how__body');
  const list = el('ol', 'sec-how__steps');

  refs = [];
  lastShown = [];

  for (let i = 0; i < STEP_COUNT; i += 1) {
    const source = c.steps[i];
    const step = el('li', 'sec-how__step');

    // THE REVEAL NEVER GOES ON THE STEP ITSELF. `.reveal` carries a transform,
    // and `core/observe.ts` adds `will-change: transform` while the transition
    // runs and takes it away again afterwards. Each of those three states makes
    // the element a containing block for its absolutely positioned
    // descendants, so a diagram nested inside a revealing step would resolve
    // its box against the step, then jump to the body when the hint was
    // dropped. That jump is a layout shift, and the spec section 12 CLS budget
    // is exactly 0.00. The text sits in its own wrapper, and the diagram is its
    // SIBLING, so no ancestor of the diagram is ever transformed.
    const text = el('div', 'sec-how__steptext reveal');
    const label = el('h3', 'sec-how__label', source.label);
    const line = el('p', 'sec-how__line', source.line);
    text.append(label, line);

    // A transform on the diagram itself is safe: it moves no ancestor, and the
    // layout instability API does not score transform movement at all.
    const vis = el('div', 'sec-how__vis reveal');

    step.append(text, vis);
    list.appendChild(step);

    let parts: HTMLElement[] = [];
    let typeTarget: HTMLElement | null = null;
    let typeText = '';

    if (i === 0) {
      const typed = buildDescribe(vis);
      typeTarget = typed.typeTarget;
      typeText = typed.typeText;
    } else if (i === 1) {
      parts = buildRetrieve(vis);
    } else if (i === 2) {
      buildGenerate(vis);
    } else if (i === 3) {
      parts = buildValidate(vis);
    } else {
      parts = buildExport(vis);
    }

    refs.push({ step, vis, parts, typeTarget, typeText });
    lastShown.push(-1);

    // The stacked variant reveals each card on enter. Under reduced motion the
    // helper settles the class synchronously, so nothing waits on an observer.
    reveal(text, { delay: i * 70 });
    reveal(vis, { delay: i * 70 + 40 });
  }

  body.appendChild(list);
  const head = buildHead();
  reveal(head);
  container.append(head, body);
  inner.appendChild(container);
  root.appendChild(inner);
}

/* ---------------------------------------------------------------------------
   The pin, spec section 7.3. Created ONLY by WP-10's matchMedia block.
   ------------------------------------------------------------------------- */

/** Write one step's state. `amount` runs 0 (untouched) to 1 (finished). */
function setStepAmount(i: number, amount: number): void {
  const r = refs[i];

  if (r.typeTarget) {
    const n = Math.round(amount * r.typeText.length);
    if (n === lastShown[i]) return;
    lastShown[i] = n;
    r.typeTarget.textContent = r.typeText.slice(0, n);
    return;
  }

  const total = r.parts.length;
  if (total === 0) return;

  let shown = 0;
  for (let j = 0; j < total; j += 1) {
    if (amount >= (j + 1) / (total + 1)) shown += 1;
  }
  if (shown === lastShown[i]) return;
  lastShown[i] = shown;
  for (let j = 0; j < total; j += 1) {
    r.parts[j].classList.toggle(PART_IN, j < shown);
  }
}

/** Map pin progress (0..1) onto the active step and its local progress. */
function apply(progress: number): void {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const scaled = p * STEP_COUNT;
  let index = Math.floor(scaled);
  if (index > STEP_COUNT - 1) index = STEP_COUNT - 1;
  const band = scaled - index;
  const local = band >= BAND_ACTIVE ? 1 : band / BAND_ACTIVE;

  for (let i = 0; i < refs.length; i += 1) {
    setStepAmount(i, i < index ? 1 : i === index ? local : 0);
  }

  if (index === lastIndex) return;
  lastIndex = index;
  for (let i = 0; i < refs.length; i += 1) {
    refs[i].step.classList.toggle(STEP_ACTIVE, i === index);
    refs[i].vis.classList.toggle(VIS_ON, i === index);
  }
}

/** Put every step back into its finished, fully visible state. */
function settleAll(): void {
  lastIndex = -1;
  for (let i = 0; i < refs.length; i += 1) {
    lastShown[i] = -1;
    setStepAmount(i, 1);
    refs[i].step.classList.remove(STEP_ACTIVE);
    refs[i].vis.classList.remove(VIS_ON);
  }
}

/**
 * Create the pin. Called ONLY from the single `gsap.matchMedia()` block in
 * `main.ts`, in document order (spec section 6.4). The returned function is
 * registered as the matchMedia cleanup, so when the query stops matching the
 * section falls back to the stacked variant with every step visible.
 *
 * The end distance is a FUNCTION so ScrollTrigger re-evaluates it on refresh
 * rather than baking in a stale viewport height.
 */
export function initScrub(): () => void {
  const root = rootEl;
  if (!root || refs.length === 0) {
    return () => {
      /* nothing was mounted, so there is nothing to tear down */
    };
  }

  root.classList.add(STAGED);

  const trigger = ScrollTrigger.create({
    trigger: '#how',
    pin: '.sec-how__inner',
    start: 'top top',
    end: () => '+=' + window.innerHeight * 5,
    scrub: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      apply(self.progress);
    },
    onRefresh: (self) => {
      apply(self.progress);
    },
  });

  apply(0);

  return () => {
    trigger.kill();
    root.classList.remove(STAGED);
    settleAll();
  };
}
