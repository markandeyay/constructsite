/**
 * sections/header.ts
 *
 * Site header, spec section 7.0, class names frozen by BUILD_CONTRACT C5.
 *
 * Ordinary mount module: it builds its own markup into the
 * `<header id="site-header">` shell and nothing else. The styles live in
 * WP-05's `components.css` and `main.ts` already calls `mount()`.
 *
 * Three behaviours live here and nowhere else:
 *   1. The skip link is the first focusable element on the page (13.2).
 *   2. A 1px bottom rule past 40px and hide-on-scroll-down past 400px, both
 *      driven by the single `onScroll` broadcast from `core/scroll.ts`, and
 *      both written to `classList` ONLY when the state actually flips (12.1).
 *   3. Anchor navigation goes through Lenis via `scrollToTarget`, never a raw
 *      native jump, which would fight the smoothing and land the target under
 *      the fixed 64px header. The real `href` stays on every anchor so the
 *      link still works without JavaScript.
 */

import { copy, GITHUB_URL } from '../content/copy';
import { onScroll, scrollToTarget } from '../core/scroll';

/** Bottom rule appears past this scroll position, spec 7.0. */
const BORDER_AT = 40;
/** Hide-on-scroll-down only engages past this scroll position, spec 7.0. */
const HIDE_AT = 400;
/** Anchor landing offset, spec 7.0: clears the fixed 64px header. */
const ANCHOR_OFFSET = -80;

const WORDMARK_ID = 'site-header-wordmark';

function link(href: string, label: string, ...classes: string[]): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = classes.join(' ');
  a.href = href;
  a.textContent = label;
  return a;
}

/**
 * Intercepts a same-page anchor and routes it through the scroll spine.
 * `scrollToTarget` falls through to native behaviour when Lenis is not
 * installed (reduced motion, 13.1), which `scroll-margin-top: 80px` handles.
 */
function routeThroughLenis(a: HTMLAnchorElement): void {
  a.addEventListener('click', (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const hash = a.getAttribute('href') ?? '';
    if (!hash.startsWith('#') || hash.length < 2) return;

    const target = document.querySelector(hash);
    if (!target) return;

    event.preventDefault();
    scrollToTarget(target, ANCHOR_OFFSET);
  });
}

export function mount(root: HTMLElement): void {
  root.classList.add('site-header');

  // 1. The skip link, first focusable element on the page (13.2). It keeps its
  //    native jump so that following it also moves focus into <main>.
  const skip = link('#main', copy.header.skip, 'skip-link');
  root.appendChild(skip);

  const inner = document.createElement('div');
  inner.className = 'site-header__inner';

  // 2. Left: the wordmark, text in the display serif at 20px, not an image.
  const wordmark = link('#hero', copy.header.wordmark, 'site-header__wordmark');
  wordmark.id = WORDMARK_ID;
  inner.appendChild(wordmark);

  // 3. Right: three anchors plus the ghost button.
  const nav = document.createElement('nav');
  nav.className = 'site-header__nav';
  // Accessible name without inventing a string: the nav is named by the
  // wordmark. See the cross-WP request in PROGRESS.md for a copy.ts key.
  nav.setAttribute('aria-labelledby', WORDMARK_ID);

  const navLinks: HTMLAnchorElement[] = [
    link('#how', copy.header.nav1, 'site-header__link'),
    link('#outputs', copy.header.nav2, 'site-header__link'),
    // The `--contact` modifier is required: components.css collapses the nav to
    // Contact only below 720px with it, and the 18.3 ban on `:not()` styling
    // chains leaves no other way to express that.
    link('#contact', copy.header.nav3, 'site-header__link site-header__link--contact'),
  ];
  navLinks.forEach((a) => {
    nav.appendChild(a);
  });

  const ghost = link(GITHUB_URL, copy.header.ghost, 'btn', 'btn--ghost', 'site-header__cta');
  ghost.target = '_blank';
  ghost.rel = 'noopener noreferrer';
  nav.appendChild(ghost);

  inner.appendChild(nav);
  root.appendChild(inner);

  [wordmark, ...navLinks].forEach(routeThroughLenis);

  // 4. Scroll state. One subscriber, no raw scroll listener, no second Lenis.
  let bordered = false;
  let hidden = false;

  onScroll((s) => {
    const nextBordered = s.y > BORDER_AT;
    if (nextBordered !== bordered) {
      bordered = nextBordered;
      root.classList.toggle('site-header--bordered', bordered);
    }

    let nextHidden = hidden;
    if (s.y <= HIDE_AT) {
      nextHidden = false;
    } else if (s.velocity > 0) {
      nextHidden = true;
    } else if (s.velocity < 0) {
      nextHidden = false;
    }

    if (nextHidden !== hidden) {
      hidden = nextHidden;
      root.classList.toggle('site-header--hidden', hidden);
    }
  });
}
