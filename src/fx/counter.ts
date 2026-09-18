/**
 * fx/counter.ts
 *
 * Count a number up when it enters the viewport: 1.2s, `--ez-out-expo`, with
 * `font-variant-numeric: tabular-nums` so the box does not jitter as the digits
 * change (spec section 7.2 and section 5.3).
 *
 * SHIPS UNUSED BY DESIGN. BUILD_CONTRACT override A6 Q3 resolves spec section
 * 20 Q3 as "no verified statistics", so section 02 ships as prose only with the
 * stat row deleted. This module is still built, correct, and exported, per that
 * override. It invents no number: `to` is always supplied by the caller, and
 * there is no default value anywhere in this file.
 *
 * PERFORMANCE. Spec section 12.1 forbids building template-literal strings per
 * frame and requires anything constant to be precomputed outside the loop. So:
 *
 *   - the easing curve is sampled into a fixed table once, at module load, and
 *     the loop does two array reads and one lerp instead of solving a cubic;
 *   - the number formatter is created once per counter, before the loop;
 *   - the suffix is its own text node, written once, so the loop never
 *     concatenates anything;
 *   - the loop writes `nodeValue` on one text node, and only when the rounded
 *     value actually changed, so an unchanged frame touches no DOM at all.
 *
 * REDUCED MOTION. The final value is written synchronously and no frame loop is
 * ever started. Nothing here ever sets opacity, so this module cannot leave an
 * element at opacity 0, and it never adds `will-change`: there is no transform
 * and no opacity transition to hint at.
 */

import { EZ, prefersReducedMotion } from '../core/motion';
import { observeOnce } from '../core/observe';

const HOST = 'fx-counter';
const VALUE = 'fx-counter__value';
const SUFFIX = 'fx-counter__suffix';

/** Spec section 7.2: the count-up is 1.2s. */
const DEFAULT_DURATION_MS = 1200;

/** Resolution of the precomputed easing table. 64 steps is visually exact. */
const EASE_SAMPLES = 64;

/**
 * Solve the y of a CSS cubic-bezier(p1x, p1y, p2x, p2y) at a given x.
 * Run EASE_SAMPLES + 1 times at module load and never again.
 */
function bezierY(p1x: number, p1y: number, p2x: number, p2y: number, x: number): number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  // Newton iteration, clamped. This is build-once code, not per-frame code.
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    if (xt > -1e-6 && xt < 1e-6) break;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (d > -1e-6 && d < 1e-6) break;
    t -= xt / d;
  }
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return ((ay * t + by) * t + cy) * t;
}

/** The `--ez-out-expo` curve, sampled once. Read from EZ so it cannot drift. */
const EASE_TABLE: Float64Array = (() => {
  const c = EZ.outExpo;
  const table = new Float64Array(EASE_SAMPLES + 1);
  for (let i = 0; i <= EASE_SAMPLES; i += 1) {
    table[i] = bezierY(c[0], c[1], c[2], c[3], i / EASE_SAMPLES);
  }
  return table;
})();

/** Table lookup plus a linear step between samples. No cubic solve per frame. */
function eased(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const scaled = p * EASE_SAMPLES;
  const i = scaled | 0;
  const frac = scaled - i;
  const a = EASE_TABLE[i];
  return a + (EASE_TABLE[i + 1] - a) * frac;
}

/**
 * Build the two text nodes once. The value node is the only thing the frame
 * loop ever writes to, and the suffix node is written exactly once.
 */
function prepare(el: HTMLElement, suffix: string): Text {
  const existing = el.querySelector('.' + VALUE);
  if (existing && existing.firstChild) {
    return existing.firstChild as Text;
  }

  const doc = el.ownerDocument;
  while (el.firstChild) el.removeChild(el.firstChild);

  const valueEl = doc.createElement('span');
  valueEl.className = VALUE;
  const node = doc.createTextNode('');
  valueEl.appendChild(node);
  el.appendChild(valueEl);

  if (suffix !== '') {
    const suffixEl = doc.createElement('span');
    suffixEl.className = SUFFIX;
    suffixEl.appendChild(doc.createTextNode(suffix));
    el.appendChild(suffixEl);
  }

  el.classList.add(HOST);
  return node;
}

/**
 * Animate `el` from zero to `to` when it first enters the viewport.
 *
 * `to` is the caller's number. This module never supplies, guesses, rounds up,
 * or defaults it.
 */
export function countUp(
  el: HTMLElement,
  to: number,
  opts?: { durationMs?: number; suffix?: string },
): void {
  const suffix = opts?.suffix ?? '';
  const node = prepare(el, suffix);

  // Precomputed once, outside every loop: the formatter, the duration, and the
  // finished string. Grouping only when the target is large enough to need it.
  const format = new Intl.NumberFormat(undefined, {
    useGrouping: Math.abs(to) >= 10000,
    maximumFractionDigits: 0,
  });
  const finalText = format.format(to);
  const duration = opts?.durationMs ?? DEFAULT_DURATION_MS;

  const finish = (): void => {
    if (node.nodeValue !== finalText) node.nodeValue = finalText;
  };

  if (prefersReducedMotion() || duration <= 0) {
    finish();
    return;
  }

  node.nodeValue = format.format(0);

  observeOnce(el, () => {
    // Re-read live: the setting can be turned on between registering and
    // entering the viewport. Same discipline as core/observe.ts.
    if (prefersReducedMotion()) {
      finish();
      return;
    }

    const start = performance.now();
    let last = Number.NaN;

    const step = (now: number): void => {
      const p = (now - start) / duration;
      if (p >= 1) {
        finish();
        return;
      }
      const value = Math.round(to * eased(p));
      // An unchanged frame writes nothing at all.
      if (value !== last) {
        last = value;
        node.nodeValue = format.format(value);
      }
      window.requestAnimationFrame(step);
    };

    window.requestAnimationFrame(step);
  });
}
