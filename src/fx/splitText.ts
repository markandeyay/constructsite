/**
 * fx/splitText.ts
 *
 * Per word and per glyph splitting, plus the clip-mask-from-below reveal that
 * spec section 5.5 and section 7.1 ask for: the hero H1 at a 45ms stagger, the
 * hero lede at 18ms, every section title at 40ms.
 *
 * These are CSS transitions driven by class toggles (spec section 6.2), never
 * GSAP tweens. GSAP is reserved for scrubs. Once a reveal has fired it runs on
 * the compositor and costs the main thread nothing.
 *
 * ACCESSIBILITY, stated plainly because the naive version of this file is a
 * screen reader disaster. A per glyph split that leaves the fragments in the
 * accessibility tree is announced letter by letter, and a per word split with
 * the spaces thrown away copies as one run-together string. So the split
 * produces TWO layers inside the host element:
 *
 *   1. `.fx-split__sr`  the original string, intact, one text node. Visually
 *      hidden, NOT aria-hidden, so it is the whole accessible name of the host.
 *      It carries `user-select: none` so it never lands in a copy buffer.
 *   2. `.fx-split__vis` the visual fragments, `aria-hidden="true"` so assistive
 *      technology never sees a single fragment. It stays selectable, and word
 *      fragments are separated by real space text nodes, so selecting and
 *      copying the rendered text yields normal words with normal spaces.
 *
 * The two layers never both reach the same consumer: AT reads layer 1 only,
 * the clipboard reads layer 2 only, and the eye sees layer 2 only.
 *
 * REDUCED MOTION. The hidden state lives behind `.fx-split--armed`, and that
 * class is added at exactly one place in this file, inside a branch guarded by
 * `prefersReducedMotion() === false`. Splitting alone never hides anything, so
 * an element that is merely split is fully visible. The `.no-motion`
 * settled rule in `sections.css` is the second line of defence and beats the
 * armed rule on document order, which covers a user flipping the OS setting
 * after arming. Spec section 19 is therefore structural here, not lucky.
 */

import { prefersReducedMotion } from '../core/motion';
import { reveal } from '../core/observe';

/** Marks the host so a second call does not double wrap. */
const MODE_ATTR = 'fxSplit';

const HOST = 'fx-split';
const ARMED = 'fx-split--armed';
const SR = 'fx-split__sr';
const VIS = 'fx-split__vis';
const GROUP = 'fx-split__group';
const CLIP = 'fx-split__clip';
const INNER = 'fx-split__inner';

/** Spec section 5.5 default: section titles reveal at a 40ms stagger. */
const DEFAULT_STAGGER_MS = 40;

type Mode = 'words' | 'chars';

/**
 * The string the split is built from. On a first call that is the element's
 * own text. On a repeat call it is the preserved `.fx-split__sr` node, so
 * re-splitting never compounds the previous split's markup.
 */
function sourceText(el: HTMLElement): string {
  const sr = el.querySelector('.' + SR);
  const raw = sr ? (sr.textContent ?? '') : (el.textContent ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * One word or one glyph: a static clip box with a moving inner span inside it.
 *
 * The RETURNED element is the clip, not the inner, and that is load bearing.
 * The clip is `overflow: hidden` and the armed inner sits entirely below it, so
 * an IntersectionObserver pointed at the inner computes an empty intersection
 * rect (ancestor overflow clipping is part of that computation) and the element
 * can never report as intersecting. It would stay armed forever. The clip never
 * moves, so it is the only safe thing to observe.
 */
function makeWord(doc: Document, text: string): HTMLElement {
  const clip = doc.createElement('span');
  clip.className = CLIP;
  const inner = doc.createElement('span');
  inner.className = INNER;
  inner.appendChild(doc.createTextNode(text));
  clip.appendChild(inner);
  return clip;
}

/**
 * Build both layers and return the per word (or per glyph) clip boxes, in
 * document order.
 * Idempotent: a host already split in the requested mode is returned as is.
 */
function split(el: HTMLElement, mode: Mode): HTMLElement[] {
  if (el.dataset[MODE_ATTR] === mode) {
    return Array.prototype.slice.call(el.querySelectorAll('.' + CLIP)) as HTMLElement[];
  }

  const text = sourceText(el);
  const doc = el.ownerDocument;

  // Wipe whatever is there, including a previous split in the other mode.
  while (el.firstChild) el.removeChild(el.firstChild);

  if (text === '') {
    el.classList.add(HOST);
    el.dataset[MODE_ATTR] = mode;
    return [];
  }

  const sr = doc.createElement('span');
  sr.className = SR;
  sr.appendChild(doc.createTextNode(text));

  const vis = doc.createElement('span');
  vis.className = VIS;
  vis.setAttribute('aria-hidden', 'true');

  const words = text.split(' ');
  const parts: HTMLElement[] = [];

  for (let w = 0; w < words.length; w += 1) {
    if (w > 0) {
      // A real space text node, so the visual layer copies with normal spaces
      // and so the line breaks where a line is allowed to break.
      vis.appendChild(doc.createTextNode(' '));
    }

    if (mode === 'words') {
      const clip = makeWord(doc, words[w]);
      vis.appendChild(clip);
      parts.push(clip);
      continue;
    }

    // Glyph mode. Each word gets a non-breaking group so a word never splits
    // across two lines just because its letters are separate boxes.
    const group = doc.createElement('span');
    group.className = GROUP;
    // Array.from walks code points, so an astral character stays one glyph.
    const glyphs = Array.from(words[w]);
    for (let g = 0; g < glyphs.length; g += 1) {
      const clip = makeWord(doc, glyphs[g]);
      group.appendChild(clip);
      parts.push(clip);
    }
    vis.appendChild(group);
  }

  el.appendChild(sr);
  el.appendChild(vis);
  el.classList.add(HOST);
  el.dataset[MODE_ATTR] = mode;

  return parts;
}

/**
 * Wrap every word in its own element and return those elements.
 * The accessible name of `el` is unchanged and the rendered text still copies
 * as normal words separated by normal spaces.
 */
export function splitWords(el: HTMLElement): HTMLElement[] {
  return split(el, 'words');
}

/**
 * Wrap every glyph in its own element and return those elements.
 * Assistive technology still reads one continuous string, never a letter at a
 * time, because every fragment sits inside an `aria-hidden` subtree.
 */
export function splitChars(el: HTMLElement): HTMLElement[] {
  return split(el, 'chars');
}

/**
 * The per word clip-mask-from-below reveal.
 *
 * Spec section 5.5 and section 7.1 call sites:
 *   hero H1       revealWords(h1,   { staggerMs: 45, delayMs: 150 })
 *   hero lede     revealWords(lede, { staggerMs: 18, delayMs: 550 })
 *   section title revealWords(h2,   { staggerMs: 40 })
 *
 * The stagger and the will-change lifecycle both come from
 * `core/observe.ts#reveal`, applied to each word's clip box. That helper
 * already implements spec section 6.6: it adds the hint only when a transition
 * will actually run, listens for `transitionend` on `propertyName ===
 * 'opacity'` only so the two property transition cannot double fire it (the
 * inner's event bubbles to the clip, which is where the listener sits), and
 * keeps a `setTimeout` backstop at duration plus this word's delay plus 200ms
 * that removes the hint whether or not the event ever arrives. None of that is
 * reimplemented here.
 */
export function revealWords(
  el: HTMLElement,
  opts?: { staggerMs?: number; delayMs?: number },
): void {
  const words = splitWords(el);
  const stagger = opts?.staggerMs ?? DEFAULT_STAGGER_MS;
  const delay = opts?.delayMs ?? 0;

  // THE ONLY reduced-motion branch that matters. Under reduced motion the host
  // is never armed, so no rule in this feature can produce opacity 0, and the
  // text is already in its settled state at this instant. `reveal()` is still
  // called so the settled class is applied synchronously and consistently.
  if (prefersReducedMotion()) {
    el.classList.remove(ARMED);
    for (let i = 0; i < words.length; i += 1) reveal(words[i]);
    return;
  }

  el.classList.add(ARMED);
  for (let i = 0; i < words.length; i += 1) {
    reveal(words[i], { delay: delay + i * stagger });
  }
}
