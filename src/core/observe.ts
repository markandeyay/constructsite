/**
 * core/observe.ts
 *
 * The reveal helper (spec section 6.2) and the will-change lifecycle
 * (spec section 6.6).
 *
 * Reveals are CSS transitions toggled by a class, never GSAP tweens: a CSS
 * transition runs on the compositor and costs the main thread nothing once it
 * has fired. This module only ever adds and removes classes and a `will-change`
 * hint.
 *
 * Observers are shared. One IntersectionObserver exists per distinct
 * rootMargin, not one per element.
 */

import { DUR, prefersReducedMotion } from './motion';

/** The settled-state class. `.reveal` is the initial state, owned by WP-02. */
const REVEALED = 'is-revealed';

/** Default rootMargin for reveals: fire a little before the element is flush. */
const REVEAL_ROOT_MARGIN = '0px 0px -10% 0px';

/** Spec section 6.6: the backstop clears will-change no matter what fires. */
const BACKSTOP_PAD_MS = 200;

type Handler = (el: Element) => void;

type SharedObserver = {
  io: IntersectionObserver;
  enter: Map<Element, Handler>;
  leave: Map<Element, Handler>;
};

const observers = new Map<string, SharedObserver>();

function getObserver(rootMargin: string): SharedObserver {
  const existing = observers.get(rootMargin);
  if (existing) return existing;

  const enter = new Map<Element, Handler>();
  const leave = new Map<Element, Handler>();
  const io = new IntersectionObserver(
    (entries) => {
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry.isIntersecting) {
          const cb = enter.get(entry.target);
          if (cb) cb(entry.target);
        } else {
          const cb = leave.get(entry.target);
          if (cb) cb(entry.target);
        }
      }
    },
    { rootMargin, threshold: 0 },
  );

  const shared: SharedObserver = { io, enter, leave };
  observers.set(rootMargin, shared);
  return shared;
}

function unwatch(shared: SharedObserver, el: Element): void {
  shared.enter.delete(el);
  shared.leave.delete(el);
  shared.io.unobserve(el);
}

/**
 * Add the compositor hint, then take it away again.
 *
 * Failure mode 1: transitioning both transform and opacity emits TWO
 * transitionend events. We listen for opacity only, so the handler runs once.
 *
 * Failure mode 2: with a zero duration the event may never fire at all, so a
 * setTimeout backstop at (duration + delay + pad) removes the hint regardless.
 * Under reduced motion we never add the hint in the first place, so there is
 * nothing for either path to clean up.
 */
function manageWillChange(el: Element, delayMs: number): void {
  const node = el as HTMLElement;
  node.style.willChange = 'transform, opacity';

  let cleared = false;
  const clear = (): void => {
    if (cleared) return;
    cleared = true;
    node.style.willChange = '';
    node.removeEventListener('transitionend', onEnd);
    window.clearTimeout(timer);
  };

  function onEnd(e: Event): void {
    // Only opacity. Listening to every property double-fires.
    if ((e as TransitionEvent).propertyName !== 'opacity') return;
    clear();
  }

  const timer = window.setTimeout(clear, DUR.reveal * 1000 + delayMs + BACKSTOP_PAD_MS);
  node.addEventListener('transitionend', onEnd);
}

function settle(el: Element, delayMs: number): void {
  // Re-check live. The user may have turned reduced motion on between the
  // observer being registered and this element entering the viewport.
  if (prefersReducedMotion()) {
    el.classList.add(REVEALED);
    return;
  }
  if (delayMs > 0) {
    window.setTimeout(() => {
      // No will-change without a transition to hint at.
      if (prefersReducedMotion()) {
        el.classList.add(REVEALED);
        return;
      }
      manageWillChange(el, 0);
      el.classList.add(REVEALED);
    }, delayMs);
    return;
  }
  manageWillChange(el, 0);
  el.classList.add(REVEALED);
}

/**
 * Reveal an element when it enters the viewport.
 *
 * Under reduced motion the settled class is added SYNCHRONOUSLY here and the
 * function returns: no observer, no timer, no transition, no will-change. That
 * is what makes spec section 19's "no element ever sits at opacity 0 with
 * reduced motion on" structural rather than lucky. There is no code path in
 * this module that both defers the class and can be reached with reduced motion
 * on: every deferral point re-checks `prefersReducedMotion()` first.
 */
export function reveal(el: Element, opts?: { delay?: number; once?: boolean }): void {
  const delay = opts?.delay ?? 0;
  const once = opts?.once ?? true;

  if (prefersReducedMotion()) {
    el.classList.add(REVEALED);
    return;
  }

  const shared = getObserver(REVEAL_ROOT_MARGIN);

  shared.enter.set(el, (target) => {
    if (once) unwatch(shared, target);
    settle(target, delay);
  });

  if (!once) {
    shared.leave.set(el, (target) => {
      target.classList.remove(REVEALED);
    });
  }

  shared.io.observe(el);
}

/**
 * Reveal a set of elements with a per-element delay, through the SAME shared
 * observer. No observer is created per element.
 */
export function revealGroup(els: ArrayLike<Element>, staggerMs = 70): void {
  const step = prefersReducedMotion() ? 0 : staggerMs;
  for (let i = 0; i < els.length; i += 1) {
    reveal(els[i], { delay: i * step });
  }
}

/**
 * The generic one-shot. Used for lazy work such as loading the 3D viewer when
 * the structure section is within 1.5 viewport heights (spec section 9.5).
 * Fires once, then stops observing. Independent of reduced motion: this is a
 * loading trigger, not an animation.
 */
export function observeOnce(el: Element, cb: () => void, rootMargin = '0px'): void {
  const shared = getObserver(rootMargin);
  shared.enter.set(el, (target) => {
    unwatch(shared, target);
    cb();
  });
  shared.io.observe(el);
}
