/**
 * sections/problem.ts
 *
 * Section 02, The problem. Spec section 7.2, with BUILD_CONTRACT override
 * A6 Q3 applied.
 *
 * SHAPE. Narrow container, centred, prose. The standard section head from
 * BUILD_CONTRACT C5, then the two paragraphs of copy. That is the whole
 * section.
 *
 * NO STAT ROW. Spec section 7.2 describes a three item stat row with counting
 * numerals and, in the same breath, says not to invent the numbers. Override
 * A6 Q3 resolves that: no verified statistics exist, so this section ships as
 * prose only and the stat row is deleted. Nothing here calls `countUp`, and
 * the only numeral rendered anywhere in this section is the decorative `02`
 * in the section head, which is `aria-hidden` per spec section 13.2.
 *
 * MOTION. Spec section 5.5, driven entirely by `.is-revealed` toggled by
 * core/observe.ts. The rule draw, the numeral and kicker stagger all live in
 * layout.css and fire from a single `reveal()` on the `.sec-head` element.
 * The title reveals per word through fx/splitText.ts at the spec's 40ms
 * stagger. The paragraphs reveal on enter. These are CSS transitions, never
 * GSAP tweens (spec section 6.2), and this module creates no ScrollTrigger:
 * it exports no `initScrub`, because a prose section has nothing to scrub and
 * spec section 6.4 allows triggers to be created in one place only.
 *
 * REDUCED MOTION. Structural, not lucky. Every element this module builds is
 * readable with no class on it at all: the paragraphs carry `.reveal`, whose
 * hidden state is cancelled by `.no-motion .reveal` in base.css, and
 * `reveal()` adds the settled class synchronously when reduced motion is on.
 * `revealWords` never arms the title in that mode. The block in sections.css
 * adds a third backstop under both `.no-motion` and the media query, so no
 * element in this section can sit at `opacity: 0`.
 *
 * Every user facing string comes from content/copy.ts. None is written here.
 */

import { copy } from '../content/copy';
import { reveal } from '../core/observe';
import { revealWords } from '../fx/splitText';

const c = copy.problem;

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
 * The BUILD_CONTRACT C5 section head, exactly as specified there: numeral,
 * kicker, title, rule, in that order, inside a `.sec-head`.
 *
 * The numeral is decorative (spec section 13.2) so it is `aria-hidden`. The
 * title carries `id="problem-title"` because the shell that WP-01 authored
 * already points `aria-labelledby` at that id.
 */
function buildHead(): { head: HTMLElement; title: HTMLElement } {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'problem-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return { head, title };
}

export function mount(root: HTMLElement): void {
  root.classList.add('sec-problem');

  const container = el('div', 'container container--narrow');

  const { head, title } = buildHead();

  // `.prose` carries the 34em measure, the 1.65 line height and the paragraph
  // rhythm. It is WP-05's class and nothing here redefines any of it.
  const prose = el('div', 'prose sec-problem__prose');
  const p1 = el('p', 'sec-problem__para reveal', c.body1);
  const p2 = el('p', 'sec-problem__para reveal', c.body2);
  prose.append(p1, p2);

  container.append(head, prose);
  root.appendChild(container);

  // Everything below runs only once the nodes are in the document, because
  // an IntersectionObserver pointed at a detached element never intersects.

  // One reveal on the head drives the rule draw at 900ms and the numeral and
  // kicker fade up at a 60ms stagger. Both are layout.css rules keyed off
  // `.sec-head.is-revealed`.
  reveal(head);

  // Spec section 5.5 beat 3: the title reveals per word, 40ms stagger, clip
  // mask from below. 40ms is fx/splitText.ts's own default, passed explicitly
  // so the beat is readable at the call site.
  revealWords(title, { staggerMs: 40 });

  // Beat 4: the paragraphs reveal on enter, one behind the other.
  reveal(p1);
  reveal(p2, { delay: 70 });
}
