/**
 * src/sections/traction.ts
 *
 * Section 07: Where we are (spec section 7.7, content section 11.7, with the
 * BUILD_CONTRACT A6 Q4 and Q9 overrides already applied inside copy.ts).
 *
 * SHAPE. The shared section head from BUILD_CONTRACT C5, then four items: a
 * headline in the display serif plus one line of muted body. Four in a row at
 * desktop, two by two at tablet, stacked at mobile. That is the entire
 * section.
 *
 * TEXT ONLY, AND THAT IS THE POINT. Spec section 7.7 bans icons outright, and
 * override A6 Q4 records that there is no written permission to display the
 * Addgene wordmark or mark, so nothing in this module renders, embeds, links
 * to, or recreates any third party logo. There is no `<img>`, no `<svg>`, no
 * background image and no icon font anywhere in this file or in its block of
 * sections.css. Spec section 19 carries a checkbox for exactly this, and the
 * only honest way to tick it is for the markup to have nowhere for a mark to
 * live.
 *
 * COPY. Every string comes from `copy.traction` and is rendered verbatim. This
 * module writes no user facing string of its own, adds no connecting phrase,
 * and invents no subtitle. That is deliberate: Appendix B names this section's
 * data source row as the single highest risk claim on the site, WP-04 walked
 * every row of that register and documented the walk in progress/WP-04.md, and
 * rewording anything here would silently discard that walk. In particular the
 * partnership word that override A6 Q4 forbids and the training phrase that
 * override A6 Q9 forbids appear nowhere in the rendered section, the accuracy
 * line keeps its "curated" qualifier that the section 16.5 lint measures, and
 * no count of commits, users, labs, dollars or clinical status is added, since
 * Appendix B forbids each of those by name.
 *
 * MOTION, spec sections 5.5 and 6.2. One `reveal()` on the head drives the
 * rule drawing left to right and the numeral and kicker fading up at a 60ms
 * stagger, both declared in WP-05's layout.css. The title reveals per word at
 * a 40ms stagger through `revealWords`. The four items reveal on enter with a
 * stagger through `revealGroup`. All of these are CSS transitions toggled by
 * IntersectionObserver, never GSAP tweens.
 *
 * NO SCRUB. This module creates no ScrollTrigger and exports no `initScrub`:
 * four text items have nothing to scrub, and spec section 6.4 allows triggers
 * to be created in one place only, the single `gsap.matchMedia()` block in
 * main.ts.
 *
 * REDUCED MOTION, spec section 13.1 and the section 19 gate. Structural, not
 * lucky. Every element is readable with no class on it at all, `reveal()` adds
 * the settled class synchronously when reduced motion is on, `revealWords`
 * never arms the title in that mode, `.no-motion .reveal` in base.css cancels
 * the hidden state even if no script runs, and this section's block in
 * sections.css adds a third backstop under both `.no-motion` and the media
 * query. Nothing here can sit at `opacity: 0`.
 */

import { copy } from '../content/copy';
import { reveal, revealGroup } from '../core/observe';
import { revealWords } from '../fx/splitText';

const c = copy.traction;

/** Spec section 5.5 beat 3: section titles reveal per word at 40ms. */
const TITLE_STAGGER_MS = 40;

/** The four items reveal one behind the other on enter. */
const ITEM_STAGGER_MS = 70;

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
 * The shared section head, BUILD_CONTRACT C5, in the order fixed there. The
 * numeral is decorative so it is `aria-hidden` (spec section 13.2), and the
 * title carries `id="traction-title"` because the shell WP-01 authored already
 * points `aria-labelledby` at that id.
 */
function buildHead(): { head: HTMLElement; title: HTMLElement } {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'traction-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return { head, title };
}

/**
 * One item: a display serif headline and one muted line beneath it. No icon,
 * no mark, no image, no rule of its own. Both strings are rendered as text
 * nodes exactly as `copy.ts` holds them.
 */
function buildItem(item: { h: string; b: string }): HTMLElement {
  const li = el('li', 'sec-traction__item reveal');

  // h3 under the section h2, per the spec section 13.2 heading order.
  const heading = el('h3', 'sec-traction__h', item.h);
  const body = el('p', 'sec-traction__b', item.b);

  li.append(heading, body);
  return li;
}

export function mount(root: HTMLElement): void {
  root.classList.add('sec-traction');

  const container = el('div', 'container sec-traction__inner');

  const { head, title } = buildHead();

  const list = el('ul', 'grid sec-traction__grid');
  // base.css resets list styling, which drops the implicit list semantics in
  // some browser and screen reader pairings, so the role is restated.
  list.setAttribute('role', 'list');

  const items: HTMLElement[] = [];
  for (let i = 0; i < c.items.length; i += 1) {
    const li = buildItem(c.items[i]);
    items.push(li);
    list.append(li);
  }

  container.append(head, list);
  root.append(container);

  // Everything below runs only once the nodes are in the document: an
  // IntersectionObserver pointed at a detached element never intersects.

  reveal(head);
  revealWords(title, { staggerMs: TITLE_STAGGER_MS });
  revealGroup(items, ITEM_STAGGER_MS);
}
