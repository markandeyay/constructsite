/**
 * sections/structure.ts
 *
 * Section 06, From sequence to structure. Spec section 7.6, with the viewer
 * itself specified in spec section 9 and built by WP-07 in fx/viewer3d.ts.
 *
 * SHAPE. Full bleed, --paper-sunk, minimum 80vh. The BUILD_CONTRACT C5 section
 * head, then a stage holding three things: the viewer element, an overlaid
 * left aligned caption block, and the PDB attribution line. The attribution is
 * a SIBLING of the viewer element, never a child of it: everything inside that
 * element is managed by fx/viewer3d.ts, which appends its own stage or still
 * and queries nothing else.
 *
 * THE VIEWER IS NOT OURS. This module imports `mountViewer3d` and does nothing
 * else with 3D. It does not import 3dmol, does not create a viewer, does not
 * touch the palette, the auto rotation, the drag handling, the lazy dynamic
 * import at 1.5 viewport heights, or the mobile and no WebGL still. All of
 * that is WP-07's and is already final.
 *
 * SCRUB. `initScrub` maps scroll progress through the section to
 * `handle.setZoom(p)`, pulling from a wide establishing shot to a closer view
 * (spec section 7.6). It is called ONLY from the single `gsap.matchMedia()`
 * block in main.ts (WP-10), in document order. Nothing in this file calls it,
 * and this is the only place in this file where a ScrollTrigger is created.
 * Creating one anywhere else is the exact bug spec section 6.4 exists to
 * prevent.
 *
 * NO HANDLE MEANS NO SCRUB. `mountViewer3d` resolves `null` when it rendered
 * the static still instead of the WebGL viewer, which is what happens below
 * 720px and without WebGL. The scrub is then either never created, or killed
 * the moment that answer arrives, and `setZoom` is never called on nothing.
 *
 * LAYOUT STABILITY. The viewer element carries WP-07's reserved
 * `aspect-ratio: 4 / 3` box with an explicit width and height on the still, so
 * neither the canvas nor the image can shift layout. The block this module owns
 * in sections.css positions that element and never overrides its box. The CLS
 * budget in spec section 12 is exactly 0.00.
 *
 * REDUCED MOTION, spec section 13.1 and the section 19 gate. This module writes
 * no opacity anywhere. The hidden-then-settled state on the text belongs to the
 * shipped `.reveal` primitive, which base.css cancels under `.no-motion` and
 * which core/observe.ts settles synchronously when reduced motion is on. The
 * viewer element itself never carries `.reveal`, so it is visible in every
 * mode. The structure does not auto rotate under reduced motion, which WP-07
 * already handles, and where the WebGL viewer is loaded at all it stays
 * draggable: the caption panel that sits over it is `pointer-events: none`.
 *
 * TRUTH. Override A6 Q12: the caption must not claim this structure matches the
 * demo construct shown in the hero, because that payload is a placeholder and
 * the correspondence would be false. `copy.structure.caption` was already cut
 * back by WP-04 to describe the structure on its own terms, and it is rendered
 * verbatim. No linking sentence and no connecting phrase is added here.
 *
 * Every user facing string comes from content/copy.ts. None is written here.
 */

import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { copy } from '../content/copy';
import { reveal } from '../core/observe';
import { revealWords } from '../fx/splitText';
import { mountViewer3d, type Viewer3dHandle } from '../fx/viewer3d';

const c = copy.structure;

/* ---------------------------------------------------------------------------
   Module state shared between mount and initScrub.

   `mount` runs first, from main.ts, and `initScrub` runs later from the single
   matchMedia block. The viewer handle arrives on a microtask in between, so
   neither function may capture it by value: both read these bindings live.
   ------------------------------------------------------------------------- */

/** The section shell, the ScrollTrigger's trigger element. */
let sectionEl: HTMLElement | null = null;

/** The viewer handle, or null while it is still pending or when it is a still. */
let handle: Viewer3dHandle | null = null;

/** True once mountViewer3d has answered with null, meaning the still is showing. */
let isStill = false;

/** The one ScrollTrigger this section creates, owned by initScrub. */
let trigger: ScrollTrigger | null = null;

/**
 * The last progress the scrub produced, kept so a zoom asked for before the
 * handle existed is applied the moment it does. WP-07 buffers setZoom calls
 * made before 3Dmol finishes loading, but the handle itself can arrive after
 * the first scrub frame, and that gap is ours to close.
 */
let pendingProgress: number | null = null;

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
 * The BUILD_CONTRACT C5 section head: numeral, kicker, title, rule, in that
 * order. The numeral is decorative (spec section 13.2) so it is aria-hidden.
 * The title carries `id="structure-title"` because the shell WP-01 authored
 * already points `aria-labelledby` at that id.
 */
function buildHead(): { head: HTMLElement; title: HTMLElement } {
  const head = el('header', 'sec-head');

  const num = el('span', 'sec-head__num', c.num);
  num.setAttribute('aria-hidden', 'true');

  const kicker = el('span', 'sec-head__kicker', c.kicker);

  const title = el('h2', 'sec-head__title', c.title);
  title.id = 'structure-title';

  const rule = el('hr', 'sec-head__rule');

  head.append(num, kicker, title, rule);
  return { head, title };
}

/** Apply a progress value to the viewer, if there is a viewer to apply it to. */
function applyZoom(p: number): void {
  pendingProgress = p;
  if (!handle) return;
  handle.setZoom(p);
}

export function mount(root: HTMLElement): void {
  root.classList.add('sec-structure');
  sectionEl = root;

  const container = el('div', 'container');

  const { head, title } = buildHead();

  const stage = el('div', 'sec-structure__stage');

  // The element WP-07 takes over. It gets `.fx-viewer3d` and its reserved
  // aspect box from that module. Nothing is ever appended into it here, and it
  // never carries `.reveal`.
  const viewer = el('div', 'sec-structure__viewer');

  // Overlaid, left aligned (spec section 7.6). A sibling of the viewer, and
  // pointer-events: none in the stylesheet so drag to rotate still reaches the
  // canvas underneath it.
  const caption = el('div', 'sec-structure__caption reveal');
  const body = el('p', 'sec-structure__body', c.body);
  // Rendered verbatim, per override A6 Q12. Nothing is added around it.
  const note = el('p', 'sec-structure__note', c.caption);
  caption.append(body, note);

  // Spec section 9.3: a small mono line crediting the PDB entry. A sibling of
  // the viewer element, per WP-07's note.
  const credit = el('p', 'sec-structure__credit mono reveal', c.pdbcredit);

  stage.append(viewer, caption, credit);
  container.append(head, stage);
  root.appendChild(container);

  // Everything below runs only once the nodes are in the document: an
  // IntersectionObserver pointed at a detached element never intersects, and
  // WP-07's own lazy-load observer is armed inside mountViewer3d.

  reveal(head);
  revealWords(title, { staggerMs: 40 });
  reveal(caption);
  reveal(credit, { delay: 70 });

  // Resolves immediately: the handle, or null when the still was rendered. The
  // 3Dmol import happens later, on approach, inside fx/viewer3d.ts.
  void mountViewer3d(viewer).then((h) => {
    handle = h;
    if (!h) {
      // Static still. There is nothing to zoom, so the scrub is retired even
      // if initScrub already created it.
      isStill = true;
      if (trigger) {
        trigger.kill();
        trigger = null;
      }
      return;
    }
    if (pendingProgress !== null) h.setZoom(pendingProgress);
  });
}

/* ---------------------------------------------------------------------------
   initScrub
   ------------------------------------------------------------------------- */

/**
 * Called ONLY from the single `gsap.matchMedia()` block in main.ts, at and
 * above 901px with reduced motion off (spec section 6.4). Returns the cleanup
 * matchMedia runs when that query stops matching.
 *
 * Scroll progress through the section maps to camera zoom, wide to close
 * (spec section 7.6). The range starts as the section enters and ends as it
 * leaves, so the establishing shot is what a reader meets first.
 * `invalidateOnRefresh` keeps the measured range honest across font settling
 * and resize rather than baking in a stale number.
 */
export function initScrub(): void | (() => void) {
  if (!sectionEl) return;
  // No handle means the still is showing, and a still does not scrub.
  if (isStill) return;

  trigger = ScrollTrigger.create({
    trigger: sectionEl,
    start: 'top 85%',
    end: 'bottom 15%',
    scrub: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      applyZoom(self.progress);
    },
  });

  return () => {
    if (trigger) {
      trigger.kill();
      trigger = null;
    }
  };
}
