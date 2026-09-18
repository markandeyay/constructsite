/**
 * sections/hero.ts
 *
 * Section 01, the hero. Owner: WP-09a. Spec section 7.1.
 *
 * THE PRIME DIRECTIVE (spec section 0.3): this section has to make a
 * non-scientist believe the product is real, working and serious within eight
 * seconds. Everything below resolves against that. Where a choice was between
 * technically impressive and immediately legible, legible won.
 *
 * Contract C1:
 *   export function mount(root: HTMLElement): void
 *   export function initScrub(): void
 *
 * `initScrub` is called ONLY from the single `gsap.matchMedia()` block in
 * `main.ts` (WP-10). Nothing in this file calls it, and nothing in this file
 * creates a ScrollTrigger. That is the bug spec section 6.4 exists to prevent.
 *
 * REDUCED MOTION, spec section 13.1 and the section 19 gate. This file writes
 * no opacity anywhere, ever. Every hidden-then-settled state on this section is
 * owned by one of three shipped primitives, and all three settle synchronously
 * when reduced motion is on:
 *
 *   - `.reveal` / `.is-revealed`          base.css plus `settleOnLoad` below
 *   - `.fx-split--armed`                  sections.css plus fx/splitText.ts
 *   - `.fx-plasmid--armed`                sections.css plus fx/plasmid.ts
 *
 * The hero is the most likely place on the site to strand an element at
 * opacity 0, so it owns none of that state itself. That makes the gate
 * structural rather than lucky.
 *
 * PARALLAX: ONE TRANSFORMED LAYER PER COLUMN, NEVER A LOOSE ELEMENT INSIDE
 * ONE. Spec section 7.1 puts the headline and the right column at the far
 * depth. The `data-depth` attribute therefore sits on `.sec-hero__copy` and on
 * `.sec-hero__visual`, the two columns, and the headline rides the left one.
 *
 * It is NOT on the `<h1>` itself, because spec section 6.5's transform is
 * `(1 - factor) * (scrollY - elementTop)` clamped to plus or minus 80px, and
 * that is a per element offset driven by each element's own document top. A
 * single transformed element inside an otherwise static stack therefore slides
 * through its own neighbours across a 115px range, while they stay put.
 * Measured at 1440x900 with the attribute on the `<h1>`:
 *
 *   scrollY=0     heading box 12.8px INTO the kicker's box (standing offset
 *                 of -28.8px before the visitor has scrolled at all)
 *   scrollY=500   heading box 10.4px into the lede
 *   scrollY=700   heading box 38.4px into the lede, and the descenders of
 *                 "you can order." visibly touch the lede's first line
 *   scrollY=1000+ 56px, the +80px clamp
 *
 * With the attribute on the column, every element inside it shares one offset,
 * so internal spacing is rigid at every scroll position and nothing can
 * collide. The column still separates from the rest of the page as the visitor
 * leaves, which is what spec section 7.1 asks the motion to express.
 */

import { copy, GITHUB_URL } from '../content/copy';
import { scrollToTarget } from '../core/scroll';
import { DUR, prefersReducedMotion } from '../core/motion';
import { revealWords, splitWords } from '../fx/splitText';
import { mountPlasmid } from '../fx/plasmid';

/* ---------------------------------------------------------------------------
   Load beats, spec section 7.1

   These fire once at boot. They are NOT scroll driven, and they are NOT gated
   on the element being in the viewport: see the note under the table.

   The plasmid map is deliberately absent from this table. Spec section 8.6
   mounts it in an idle callback and an idle callback has no guaranteed
   wall-clock time, so it runs on its own timeline inside fx/plasmid.ts,
   measured from the moment seqviz reports mount complete. The two are never
   coupled.
   ------------------------------------------------------------------------- */

/**
 * WHY THIS SECTION DOES NOT USE `core/observe.ts#reveal` FOR ITS OWN BEATS.
 *
 * `reveal()` is an IntersectionObserver reveal: spec section 6.2's "element
 * enters viewport, once". Spec section 7.1's hero beats are a different thing.
 * They fire once at boot and are explicitly NOT scroll driven, and the hero is
 * by definition the top of the document.
 *
 * Measured at 1440x900 against the built page: the headline set in --t-hero
 * inside the 55 percent column runs six lines, which puts the buttons at
 * y=976 and the status line at y=1040. Both sit under an observer's threshold,
 * so an IntersectionObserver reveal leaves the primary call to action
 * invisible until the visitor scrolls. That is the exact failure the eight
 * second rule in spec section 0.3 cannot afford.
 *
 * So `settleOnLoad` below runs the beats on a clock. It reuses WP-02's
 * `.reveal` / `.is-revealed` CSS contract unchanged, re-checks reduced motion
 * at every deferral point exactly as `core/observe.ts` does, and implements
 * the spec section 6.6 will-change lifecycle including both documented failure
 * modes.
 *
 * The H1 and the lede still go through WP-08's `revealWords` with exactly the
 * stagger and delay values WP-08 specified: that call owns the split, the
 * armed state and the reduced-motion guard, and none of it is reimplemented
 * here. `settleWordsOnLoad` then adds a clock backstop on top of it, which
 * only ever ADDS the settled class and never removes anything. Measured
 * without it at 1440x900: 18 of the lede's word clips were still at opacity 0
 * after the load timeline, and 4 of them were still at opacity 0 after a full
 * scroll sweep. Spec section 19 says no element may sit at opacity 0, and an
 * unreadable lede in the hero is the worst version of that failure.
 */

/** t=0.00s: kicker fades in. */
const T_KICKER_MS = 0;

/** t=0.15s: H1 reveals per word, clip from below, 45ms stagger. */
const T_H1_MS = 150;
const STAGGER_H1_MS = 45;

/** t=0.55s: lede reveals per word, 18ms stagger. */
const T_LEDE_MS = 550;
const STAGGER_LEDE_MS = 18;

/** t=0.80s: both buttons fade up together, as one group. */
const T_ACTIONS_MS = 800;

/** t=2.40s: the status line fades in, well after everything else has landed. */
const T_STATUS_MS = 2400;

/** The section 03 shell the primary call to action points at (spec 4.0). */
const CTA_TARGET = '#how';

/** Spec section 6.6: the backstop clears will-change whatever does or does not fire. */
const WILL_CHANGE_PAD_MS = 200;

/**
 * Settle one `.reveal` element at a fixed moment on the load timeline.
 *
 * Reduced motion, spec section 13.1 and the section 19 gate: the settled class
 * is added SYNCHRONOUSLY and the function returns. No timer, no transition, no
 * will-change. The deferred path re-checks the preference before it settles, so
 * a visitor who turns the OS setting on mid-timeline still lands settled. There
 * is no code path here that can leave an element at opacity 0.
 */
function settleOnLoad(el: HTMLElement, delayMs: number): void {
  if (prefersReducedMotion()) {
    el.classList.add('is-revealed');
    return;
  }

  const fire = (): void => {
    if (prefersReducedMotion()) {
      el.classList.add('is-revealed');
      return;
    }

    el.style.willChange = 'transform, opacity';

    let cleared = false;
    const clear = (): void => {
      if (cleared) return;
      cleared = true;
      el.style.willChange = '';
      el.removeEventListener('transitionend', onEnd);
      window.clearTimeout(backstop);
    };

    // Failure mode 1: transitioning opacity AND transform emits two events.
    // Listen for opacity only, so this runs once.
    function onEnd(e: Event): void {
      if ((e as TransitionEvent).propertyName !== 'opacity') return;
      clear();
    }

    // Failure mode 2: the event may never arrive. Clear it regardless.
    const backstop = window.setTimeout(clear, DUR.reveal * 1000 + WILL_CHANGE_PAD_MS);
    el.addEventListener('transitionend', onEnd);

    el.classList.add('is-revealed');
  };

  if (delayMs <= 0) {
    // Still one frame late: a class toggled in the same frame the initial
    // state was written does not transition.
    requestAnimationFrame(fire);
    return;
  }
  window.setTimeout(fire, delayMs);
}

/**
 * WP-08's per word reveal, plus a clock backstop.
 *
 * `revealWords` is called first and unchanged, with WP-08's own parameters. It
 * splits the text, arms it, and registers WP-08's observers. The backstop then
 * settles each word clip at its own beat whether or not the observer ever
 * fired, which is what makes this a load timeline (spec section 7.1) rather
 * than a viewport reveal (spec section 6.2).
 *
 * `splitWords` is idempotent on an already split host and returns the same
 * CLIP boxes, never the inner spans, which is the element the settled class
 * has to land on.
 */
function settleWordsOnLoad(
  host: HTMLElement,
  opts: { staggerMs: number; delayMs: number },
): void {
  revealWords(host, opts);

  if (prefersReducedMotion()) return;

  const clips = splitWords(host);
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i];
    window.setTimeout(() => {
      clip.classList.add('is-revealed');
    }, opts.delayMs + i * opts.staggerMs);
  }
}

/* ---------------------------------------------------------------------------
   Small builders
   ------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/**
 * One line of the headline.
 *
 * The H1 is two lines of copy but exactly one element, because spec section
 * 13.2 allows the page exactly one `<h1>`. Each line is its own block span so
 * the break is structural rather than a hard-coded `<br>`, and so each line can
 * be split independently. `fx/splitText.ts` rebuilds the inside of whatever it
 * is handed, so it has to be handed a line, not the whole heading.
 *
 * The accessible name of the heading is the two intact strings in the split's
 * screen-reader layer, in order, which reads exactly as the copy is written.
 */
function headlineLine(text: string): HTMLSpanElement {
  const line = el('span', 'sec-hero__line');
  line.textContent = text;
  return line;
}

function primaryCta(): HTMLAnchorElement {
  const a = el('a', 'btn btn--primary sec-hero__cta');
  // The href stays real so keyboard activation, middle click and the section
  // 16.4 link check all see a resolvable anchor.
  a.href = CTA_TARGET;
  a.textContent = copy.hero.cta1;

  // Spec section 7.0: a raw anchor jump fights Lenis and lands the target
  // under the fixed header. Route it through the one scroll owner instead.
  // With Lenis uninstalled (reduced motion) `scrollToTarget` falls through to
  // a native scroll, which `scroll-margin-top: 80px` already accounts for.
  a.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const me = e as MouseEvent;
    // Never hijack a modified click: that is the user asking for a new tab.
    if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || me.button !== 0) return;
    e.preventDefault();
    scrollToTarget(CTA_TARGET);
  });

  return a;
}

function ghostCta(): HTMLAnchorElement {
  const a = el('a', 'btn btn--ghost sec-hero__cta');
  a.href = GITHUB_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = copy.hero.cta2;
  return a;
}

/**
 * The reserved box for the live map.
 *
 * `.fx-plasmid` is on the element IN THE MARKUP, before `mountPlasmid` runs,
 * which is what WP-06's class contract asks for. That class carries
 * `aspect-ratio: 1`, so the square is reserved at first paint and nothing
 * shifts when the map arrives. The CLS budget in spec section 12 is exactly
 * 0.00 with zero tolerance, and this is the element that would break it.
 */
function mapBox(): HTMLDivElement {
  return el('div', 'fx-plasmid sec-hero__map');
}

/* ---------------------------------------------------------------------------
   mount
   ------------------------------------------------------------------------- */

let mounted = false;

export function mount(root: HTMLElement): void {
  if (mounted) return;
  mounted = true;

  root.classList.add('sec-hero');

  const inner = el('div', 'container sec-hero__inner');

  /* --- Left column: every string comes from copy.ts ---------------------- */

  // Spec section 7.1, motion on scroll out: the headline rides at the far
  // parallax depth. The attribute goes on the COLUMN, not on the <h1> itself,
  // and that placement is load bearing. See the note above `mount`.
  const left = el('div', 'sec-hero__copy');
  left.dataset.depth = 'far';

  // Kicker, mono micro. `.micro` is WP-05's shared component: consumed, not
  // restyled beyond the colour this section asks for.
  const kicker = el('p', 'micro sec-hero__kicker reveal');
  kicker.textContent = copy.hero.kicker;

  // The page's ONE h1 (spec section 13.2). The id is fixed: the shell in
  // index.html already carries aria-labelledby="hero-title".
  const title = el('h1', 'sec-hero__title');
  title.id = 'hero-title';
  const lineA = headlineLine(copy.hero.h1a);
  const lineB = headlineLine(copy.hero.h1b);
  title.appendChild(lineA);
  title.appendChild(lineB);

  // Lede. `.lede` already supplies --t-lede, --ink-muted and the 34em measure.
  const lede = el('p', 'lede sec-hero__lede');
  lede.textContent = copy.hero.lede;

  // Both buttons fade up together, so they reveal as one group, not two.
  const actions = el('div', 'sec-hero__actions reveal');
  actions.appendChild(primaryCta());
  actions.appendChild(ghostCta());

  const status = el('p', 'micro sec-hero__status reveal');
  status.textContent = copy.hero.status;

  left.appendChild(kicker);
  left.appendChild(title);
  left.appendChild(lede);
  left.appendChild(actions);
  left.appendChild(status);

  /* --- Right column: the live map ---------------------------------------- */

  const right = el('div', 'sec-hero__visual');
  right.dataset.depth = 'far';
  const box = mapBox();
  right.appendChild(box);

  inner.appendChild(left);
  inner.appendChild(right);
  root.appendChild(inner);

  /* --- Motion on load, spec section 7.1 ---------------------------------- */

  settleOnLoad(kicker, T_KICKER_MS);

  // Per word, clip from below, 45ms stagger, continuous across both lines:
  // line B starts where line A's stagger left off, so the headline reads as
  // one sweep rather than two.
  const lineAWords = copy.hero.h1a.trim().split(/\s+/).length;
  settleWordsOnLoad(lineA, { staggerMs: STAGGER_H1_MS, delayMs: T_H1_MS });
  settleWordsOnLoad(lineB, {
    staggerMs: STAGGER_H1_MS,
    delayMs: T_H1_MS + lineAWords * STAGGER_H1_MS,
  });

  settleWordsOnLoad(lede, { staggerMs: STAGGER_LEDE_MS, delayMs: T_LEDE_MS });
  settleOnLoad(actions, T_ACTIONS_MS);
  settleOnLoad(status, T_STATUS_MS);

  /* --- The map, on its own timeline -------------------------------------- */

  // fx/plasmid.ts waits for first paint and an idle callback itself, so there
  // is nothing to schedule here. The catch is not optional: an unhandled
  // rejection is a hard gate in spec section 16.6, and a map that fails to
  // load must leave a readable hero behind rather than take the page down.
  void mountPlasmid(box).catch((err: unknown) => {
    console.warn('[hero] the plasmid map did not mount:', err);
  });
}

/* ---------------------------------------------------------------------------
   initScrub
   ------------------------------------------------------------------------- */

/**
 * Called ONLY from the single `gsap.matchMedia()` block in `main.ts`, at and
 * above 901px with reduced motion off (spec section 6.4).
 *
 * The hero creates NO ScrollTrigger and NO pin. Its scroll-out motion is spec
 * section 7.1's parallax, and that is entirely declarative: the right column
 * and the H1 carry `data-depth="far"`, and the single subscriber in
 * `core/motion.ts` (spec section 6.5) owns the transform, the clamp and the
 * cached measurement. Adding a trigger here to do the same job would mean two
 * writers on one transform.
 *
 * The function stays exported because contract C1 defines it and WP-10 calls
 * it in document order. It deliberately does nothing.
 */
export function initScrub(): void {
  /* No pin, no scrub, no ScrollTrigger. See the note above. */
}
