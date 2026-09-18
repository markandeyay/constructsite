/**
 * core/scroll.ts
 *
 * The scroll spine (spec section 6.3). This file owns the ONE Lenis instance
 * for the whole site and the ONE scroll broadcast. Nothing else in the project
 * instantiates Lenis, and nothing else attaches a raw `scroll` listener:
 * everything subscribes to `onScroll`.
 *
 * Two drivers, one contract. With motion allowed, Lenis drives native
 * `window.scrollY`. Under reduced motion Lenis is not installed at all (spec
 * section 13.1) and a passive, rAF-throttled native scroll listener feeds the
 * identical broadcast. Subscribers cannot tell which one is running.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { prefersReducedMotion } from './motion';

export type ScrollState = {
  /** Absolute scroll position in px. */
  y: number;
  /** px per frame, signed. */
  velocity: number;
  /** 0..1 through the whole document. */
  progress: number;
};

type Subscriber = (s: ScrollState) => void;

const subscribers = new Set<Subscriber>();

let lenis: Lenis | null = null;
let started = false;
let rafId = 0;
let resizeRaf = 0;

/** Set by whichever driver is running. Consumed by the single rAF broadcast. */
let dirty = true;

let lastY = 0;
let velocity = 0;

/**
 * Cached layout numbers. Spec section 12.1: no layout reads inside the scroll
 * loop, so these are refreshed only by the rAF-throttled resize handler.
 */
const view = { width: 0, height: 0, docHeight: 0 };

/** The one object handed to subscribers, reused so the loop allocates nothing. */
const state: ScrollState = { y: 0, velocity: 0, progress: 0 };

function measureViewport(): void {
  view.width = window.innerWidth;
  view.height = window.innerHeight;
  const doc = document.documentElement;
  const body = document.body;
  view.docHeight = Math.max(
    doc.scrollHeight,
    doc.offsetHeight,
    body ? body.scrollHeight : 0,
    body ? body.offsetHeight : 0,
  );
}

function onResize(): void {
  if (resizeRaf) return;
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = 0;
    measureViewport();
    dirty = true;
  });
}

function markDirty(): void {
  dirty = true;
}

function broadcast(): void {
  const y = window.scrollY;
  const moved = y !== lastY;

  // Nothing moved and we already reported a settled velocity: no work at all.
  if (!moved && !dirty && velocity === 0) return;

  velocity = y - lastY;
  lastY = y;
  dirty = false;

  const travel = view.docHeight - view.height;
  state.y = y;
  state.velocity = velocity;
  state.progress = travel > 0 ? Math.min(1, Math.max(0, y / travel)) : 0;

  subscribers.forEach((fn) => {
    fn(state);
  });
}

function loop(): void {
  rafId = window.requestAnimationFrame(loop);
  broadcast();
}

function startLoop(): void {
  if (rafId) return;
  rafId = window.requestAnimationFrame(loop);
}

/**
 * Install Lenis and wire it to ScrollTrigger exactly as spec section 6.3
 * dictates. Lenis drives the native scroll position, so it is NOT a virtual
 * scroller and `ScrollTrigger.scrollerProxy()` is the wrong tool here: using it
 * produces the pin-misplacement bug section 6.4 exists to prevent. This is the
 * only place in the project that configures ScrollTrigger's scroller.
 */
function installLenis(): void {
  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
  });

  lenis.on('scroll', ScrollTrigger.update);
  lenis.on('scroll', markDirty);

  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
}

function tick(time: number): void {
  if (lenis) lenis.raf(time * 1000);
}

/**
 * The reduced-motion driver. Native scroll only, passive listener, and the
 * broadcast is rAF-throttled by the same loop the Lenis path uses, so the
 * emitted ScrollState is byte-for-byte the same shape and cadence.
 */
function installNativeDriver(): void {
  window.addEventListener('scroll', markDirty, { passive: true });
}

/** Called once from main.ts. Idempotent. */
export function initScroll(): void {
  if (started) return;
  started = true;

  measureViewport();
  lastY = window.scrollY;
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  if (prefersReducedMotion()) {
    installNativeDriver();
  } else {
    installLenis();
    // Lenis smooths the wheel but a keyboard or programmatic jump still fires a
    // native scroll event, so the passive listener backs both drivers.
    installNativeDriver();
  }

  dirty = true;
  startLoop();
}

/**
 * Subscribe to the single broadcast. Returns an unsubscribe function.
 * Safe to call before `initScroll`: the loop is started lazily so the motion
 * core is usable in isolation (qa/motion-harness.html).
 */
export function onScroll(fn: (s: ScrollState) => void): () => void {
  subscribers.add(fn);
  if (!started) {
    measureViewport();
    lastY = window.scrollY;
  }
  dirty = true;
  startLoop();
  return () => {
    subscribers.delete(fn);
  };
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Anchor navigation, spec section 7.0. With Lenis installed the jump goes
 * through Lenis so it does not fight the smoothing. Without it, fall through to
 * native behaviour.
 *
 * THE TWO DRIVERS MUST LAND IN THE SAME PLACE. Lenis resolves an element target
 * as `rect.top + scroll - scrollMarginTop - scrollPaddingTop` before it applies
 * `options.offset`. Every section shell carries `scroll-margin-top: 80px`
 * (spec section 4.0), so handing Lenis the prescribed `offset: -80` unchanged
 * applied that 80px twice and landed the target 160px down, against 80px on the
 * native path. Both values clear the 64px header, so nothing looked broken, but
 * the drivers were distinguishable, which this module's contract forbids.
 *
 * The fix is here, not at the call site: cancel out what Lenis is about to
 * subtract, so `offset` means exactly the same thing on both paths.
 */
export function scrollToTarget(target: Element | string, offset = -80): void {
  const el = typeof target === 'string' ? document.querySelector(target) : target;

  if (lenis) {
    // Lenis wants a selector string or an HTMLElement. Resolve once, here.
    const arg: string | HTMLElement | null =
      el instanceof HTMLElement ? el : typeof target === 'string' ? target : null;
    if (!arg) return;

    let adjusted = offset;
    if (el) {
      const targetStyle = window.getComputedStyle(el);
      const rootStyle = window.getComputedStyle(document.documentElement);
      adjusted += px(targetStyle.scrollMarginTop) + px(rootStyle.scrollPaddingTop);
    }

    lenis.scrollTo(arg, { offset: adjusted, duration: 1.1 });
    return;
  }

  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY + offset;
  window.scrollTo({ top, behavior: 'auto' });
}

/** The Lenis instance, or null when reduced motion kept it uninstalled. */
export function getLenis(): unknown | null {
  return lenis;
}
