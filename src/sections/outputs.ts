/**
 * src/sections/outputs.ts
 *
 * Section 04: What it builds (spec section 7.4, content section 11.4).
 *
 * THE POINT OF THIS SECTION, spec section 1.4: eleven technical categories are
 * grouped into five legible markets, and BOTH layers appear. The plain-language
 * layer is for the judge, the technical layer is for the one scientist on the
 * panel. The plain layer is the card headline plus one sentence. The technical
 * layer is a native `<details>` disclosure holding the category names in mono.
 * All five cards ship: the fifth is the platform story.
 *
 * MARKUP. Full-width container, a five card responsive grid, and one centred
 * closing line. The grid consumes WP-05's `.grid` and each card consumes
 * WP-05's `.card`, `.card__title` and `.card__body`. Neither is restyled here.
 * Column spans give 3 then 2 at desktop, 2 at tablet, 1 at mobile.
 *
 * The disclosure is a real `<details>` / `<summary>`. No hand rolled widget:
 * the native element is focusable, toggles on Enter and Space, exposes its
 * expanded state to the accessibility tree, and keeps its content reachable
 * with no script at all.
 *
 * MOTION. The cards reveal on enter with a 70ms stagger and a 14px upward
 * translate, and that is the whole of it. The 14px and the opacity live in
 * WP-02's `.reveal` primitive, the stagger comes from `revealGroup`, and no
 * observer is created here. The card hover is defined once in WP-05's
 * components.css and is the entire card interaction. Nothing card specific is
 * added: spec section 7.4 says so in as many words.
 *
 * The reveal class sits on a wrapper element, never on the `.card` itself, so
 * the reveal translate and the hover translate never fight over one transform
 * and never share one transition declaration.
 *
 * NO SCRUB. This section creates no ScrollTrigger and exports no `initScrub`.
 * It has nothing to scrub: reveals are CSS transitions driven by
 * IntersectionObserver (spec section 6.2). Creating a ScrollTrigger outside the
 * single `gsap.matchMedia()` block in main.ts is the exact bug spec section 6.4
 * exists to prevent.
 *
 * REDUCED MOTION, spec section 13.1 and the section 19 gate. Every element here
 * renders settled and nothing can sit at `opacity: 0`. `reveal()` adds the
 * settled class synchronously when reduced motion is on, `.no-motion .reveal`
 * in base.css cancels the hidden state even if no script runs, and the
 * `<details>` content is reachable either way because the element is native.
 *
 * COPY. Every user facing string comes from `copy.outputs`. Nothing is written
 * here, which is also how this file stays inside Appendix B: the categories are
 * named as capabilities of the platform and nothing more.
 */

import { copy } from '../content/copy';
import { reveal, revealGroup } from '../core/observe';
import { revealWords } from '../fx/splitText';

const c = copy.outputs;

/** The stagger in spec section 7.4. */
const CARD_STAGGER_MS = 70;

/** Cards 4 and 5 form the second desktop row, so they take half the width. */
const WIDE_FROM_INDEX = 3;

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

/** The shared section head, BUILD_CONTRACT C5. The numeral is decorative. */
function buildHead(): { head: HTMLElement; title: HTMLElement } {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'outputs-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return { head, title };
}

/**
 * One market card: the plain-English headline, the one sentence description,
 * and the technical layer behind a native disclosure.
 */
function buildCard(card: { title: string; body: string; detail: string }, index: number): HTMLElement {
  const item = el('li', 'sec-outputs__item reveal');
  if (index >= WIDE_FROM_INDEX) item.classList.add('sec-outputs__item--wide');

  const article = el('article', 'card sec-outputs__card');

  // Spec section 13.2: one h1 on the hero, h2 for sections, h3 for cards.
  const heading = el('h3', 'card__title', card.title);

  const body = el('p', 'card__body sec-outputs__body', card.body);

  const details = el('details', 'sec-outputs__details');
  const summary = el('summary', 'sec-outputs__summary', c.detailsLabel);
  const detail = el('p', 'sec-outputs__detail mono', card.detail);
  details.append(summary, detail);

  article.append(heading, body, details);
  item.append(article);
  return item;
}

export function mount(root: HTMLElement): void {
  const container = el('div', 'container sec-outputs__inner');

  const { head, title } = buildHead();

  const list = el('ul', 'grid sec-outputs__grid');
  // The list-style reset in base.css removes the implicit list semantics in
  // some screen reader and browser pairings, so the role is restated.
  list.setAttribute('role', 'list');

  const items: HTMLElement[] = [];
  for (let i = 0; i < c.cards.length; i += 1) {
    const item = buildCard(c.cards[i], i);
    items.push(item);
    list.append(item);
  }

  const closing = el('p', 'sec-outputs__closing reveal', c.closing);

  container.append(head, list, closing);
  root.classList.add('sec-outputs');
  root.append(container);

  // Section head beats, spec section 5.5. One reveal on the head drives the
  // rule draw and the numeral and kicker fade, both declared in layout.css.
  reveal(head);
  revealWords(title, { staggerMs: 40 });

  // Spec section 7.4: 70ms stagger, 14px upward translate, and nothing else.
  revealGroup(items, CARD_STAGGER_MS);

  reveal(closing);
}
