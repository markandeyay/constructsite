/**
 * core/motion.ts
 *
 * Owns the easing family, the reduced-motion contract, the desktop motion gate,
 * and the single parallax subscriber (spec section 6.1, 6.5, 13.1).
 *
 * MIRROR WARNING: the curves below are the JS mirror of the four `--ez-*`
 * custom properties in `src/styles/tokens.css`. Both sides are generated from
 * the one shared CURVES constant in this file (the CSS side is written by hand
 * from the same numbers), so a change here is a change there. Never edit one
 * without the other, and never hand-type a cubic-bezier anywhere else.
 */

import { onScroll } from './scroll';

/** Cubic bezier control points, in CSS `cubic-bezier(a, b, c, d)` order. */
type Bezier = [number, number, number, number];

/**
 * THE single source of truth for easing. Keyed by the exact CSS custom
 * property name it mirrors in tokens.css, so the pairing is checkable by eye.
 */
const CURVES: Record<'--ez-out-expo' | '--ez-out-quart' | '--ez-in-out', Bezier> = {
  '--ez-out-expo': [0.19, 1, 0.22, 1],
  '--ez-out-quart': [0.165, 0.84, 0.44, 1],
  '--ez-in-out': [0.77, 0, 0.175, 1],
};

/**
 * GSAP-facing easing. Every tuple is read from CURVES, never retyped.
 * `linear` is GSAP's `'none'`, which is the same thing as the CSS
 * `--ez-linear: linear` token, and is for scrubs only (spec section 6.1).
 */
export const EZ: {
  outExpo: Bezier;
  outQuart: Bezier;
  inOut: Bezier;
  linear: 'none';
} = {
  outExpo: CURVES['--ez-out-expo'],
  outQuart: CURVES['--ez-out-quart'],
  inOut: CURVES['--ez-in-out'],
  linear: 'none',
};

/** Durations in seconds, which is what GSAP wants. Spec section 6.1. */
export const DUR: { micro: number; reveal: number; draw: number; hero: number } = {
  micro: 0.24,
  reveal: 0.6,
  draw: 0.9,
  hero: 1.4,
};

/** The gate for every pin and scrub on the page. Spec section 6.4. */
export const MQ_DESKTOP_MOTION = '(min-width: 901px) and (prefers-reduced-motion: no-preference)';

const MQ_REDUCE = '(prefers-reduced-motion: reduce)';

/** Parallax runs only at and above the section 5.4 motion gate width. */
const PARALLAX_MIN_WIDTH = 901;

/** Spec section 6.5: the transform is clamped, hard, at 80px either way. */
const PARALLAX_CLAMP = 80;

/** Spec section 6.5: three depths, and `near` means no attribute at all. */
const DEPTH_FACTORS: Record<string, number> = {
  mid: 0.94,
  far: 0.86,
};

/**
 * Read live, never cached at boot. A user can flip the OS setting with the page
 * open and every motion decision must follow immediately.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MQ_REDUCE).matches;
}

type ParallaxItem = {
  el: HTMLElement;
  /** Distance from the top of the document, measured on resize only. */
  top: number;
  factor: number;
  /** Last written translate, so an unchanged frame writes nothing. */
  last: number;
};

let items: ParallaxItem[] = [];
let parallaxActive = false;
let unsubscribeScroll: (() => void) | null = null;
let resizeRaf = 0;
let motionStarted = false;

/** True only when parallax is permitted right now. */
function parallaxAllowed(): boolean {
  return !prefersReducedMotion() && window.innerWidth >= PARALLAX_MIN_WIDTH;
}

/**
 * The ONE layout read pass. Runs on start and on a rAF-throttled resize, never
 * inside the scroll loop. `getBoundingClientRect().top + scrollY` is used
 * instead of `offsetTop` because offsetTop is relative to the nearest
 * positioned ancestor and a parallax element can sit inside one.
 */
function measure(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[data-depth]');
  const y = window.scrollY;
  const next: ParallaxItem[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    const depth = el.dataset.depth ?? '';
    const factor = DEPTH_FACTORS[depth];
    // `near` (factor 1.00) is the default and carries no attribute. Anything
    // unrecognised is treated the same way: no entry, so no transform, ever.
    if (factor === undefined) {
      el.style.transform = '';
      continue;
    }
    // Neutralise any transform we wrote before measuring, so the cached top is
    // the untransformed layout position.
    const prior = el.style.transform;
    el.style.transform = '';
    const top = el.getBoundingClientRect().top + y;
    el.style.transform = prior;
    next.push({ el, top, factor, last: Number.NaN });
  }
  items = next;
}

/** One transform write per element per scroll event, and no reads at all. */
function applyParallax(scrollY: number): void {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const raw = (1 - item.factor) * (scrollY - item.top);
    const ty = raw < -PARALLAX_CLAMP ? -PARALLAX_CLAMP : raw > PARALLAX_CLAMP ? PARALLAX_CLAMP : raw;
    // Sub-pixel churn is invisible and costs a compositor update, so skip it.
    if (Math.abs(ty - item.last) < 0.01) continue;
    item.last = ty;
    item.el.style.transform = 'translate3d(0, ' + ty.toFixed(2) + 'px, 0)';
  }
}

function clearParallax(): void {
  for (let i = 0; i < items.length; i += 1) {
    items[i].el.style.transform = '';
    items[i].last = Number.NaN;
  }
}

function startParallax(): void {
  if (parallaxActive) return;
  parallaxActive = true;
  measure();
  unsubscribeScroll = onScroll((s) => {
    applyParallax(s.y);
  });
  applyParallax(window.scrollY);
}

function stopParallax(): void {
  if (!parallaxActive) return;
  parallaxActive = false;
  if (unsubscribeScroll) {
    unsubscribeScroll();
    unsubscribeScroll = null;
  }
  clearParallax();
  items = [];
}

function syncParallax(): void {
  if (parallaxAllowed()) {
    if (parallaxActive) {
      measure();
      applyParallax(window.scrollY);
    } else {
      startParallax();
    }
  } else {
    stopParallax();
  }
}

function onResize(): void {
  if (resizeRaf) return;
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = 0;
    syncParallax();
  });
}

function applyNoMotionClass(reduced: boolean): void {
  const root = document.documentElement;
  // Only touch classList when the state actually changes (spec section 12.1).
  if (reduced === root.classList.contains('no-motion')) return;
  root.classList.toggle('no-motion', reduced);
}

/**
 * Called once from main.ts. Sets the `.no-motion` class on <html>, keeps it in
 * sync with live media query changes, and starts the parallax subscriber.
 */
export function initMotion(): void {
  if (motionStarted) return;
  motionStarted = true;

  const reduceQuery = window.matchMedia(MQ_REDUCE);
  applyNoMotionClass(reduceQuery.matches);

  const onReduceChange = (): void => {
    applyNoMotionClass(reduceQuery.matches);
    syncParallax();
  };

  if (typeof reduceQuery.addEventListener === 'function') {
    reduceQuery.addEventListener('change', onReduceChange);
  } else {
    // Safari below 14 only has the deprecated listener API.
    (reduceQuery as MediaQueryList & { addListener(cb: () => void): void }).addListener(onReduceChange);
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  syncParallax();

  // Late-loading fonts and images move elements, which invalidates the cached
  // tops. Re-measure once when fonts settle rather than polling.
  if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(() => {
      if (parallaxActive) {
        measure();
        applyParallax(window.scrollY);
      }
    }).catch(() => {
      /* font loading is best effort, a failure here changes nothing */
    });
  }
}
