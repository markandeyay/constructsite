/**
 * fx/viewer3d.ts  (WP-07)
 *
 * The 3D molecular viewer, spec section 9. Wraps 3Dmol.js around the green
 * fluorescent protein structure baked into public/data/structures/gfp.pdb.
 *
 * Three rules shape this file:
 *
 * 1. 3Dmol is NEVER in the initial bundle. It is dynamically imported, and
 *    only once the structure section is within 1.5 viewport heights of the
 *    viewport (spec sections 9.5 and 12).
 * 2. Below 720px, or without WebGL, 3Dmol is not loaded at all. A
 *    pre-generated still of the same structure at the same camera is rendered
 *    instead (spec section 9.4).
 * 3. The colouring is the muted secondary-structure palette, never the default
 *    spectrum or rainbow, which is exactly the look spec section 2.4 bans.
 *
 * This module creates no ScrollTrigger. It exposes setZoom(0..1) and WP-10
 * drives it from the single matchMedia block (spec section 6.4).
 */

import { observeOnce } from '../core/observe';
import { prefersReducedMotion } from '../core/motion';

/* ------------------------------------------------------------------ *
 * Palette
 *
 * 3Dmol runs in WebGL and cannot resolve CSS custom properties, so these
 * are hex literals kept in sync with styles/tokens.css BY HAND. If a token
 * below changes in tokens.css, change it here too, and regenerate the still
 * (the camera parameters are in progress/WP-07.md).
 *
 * 3Dmol sets atom.ss to the single characters 'h', 's' and 'c', NOT
 * 'helix' / 'sheet' / 'coil'. Keying it the long way silently falls through
 * to the default for every atom, which is how a viewer ends up rainbow.
 * ------------------------------------------------------------------ */

const SS_COLORS: Record<string, string> = {
  h: '#1F6B4A', // helix = --accent
  s: '#2E6F95', // sheet = --feat-promoter
  c: '#656E77', // coil  = --ink-faint
};

/** Any atom without a recognised ss value is drawn as coil. */
const SS_FALLBACK = '#656E77';

/** --paper-sunk. Never black. */
const BACKGROUND = '#F2F0EC';

/* ------------------------------------------------------------------ *
 * Assets and constants
 * ------------------------------------------------------------------ */

const STRUCTURE_URL = '/data/structures/gfp.pdb';
const STILL_URL = '/data/structures/gfp-still.webp';

/** Intrinsic size of the still, and the aspect the live stage reserves. */
const STILL_W = 1200;
const STILL_H = 900;

/**
 * Spec section 13.2: the canvas gets a real text alternative, and the still
 * gets a real alt. Neither is empty and neither is a filename. These describe
 * the structure rather than naming the file.
 *
 * These live here rather than in copy.ts because the frozen copy.structure
 * shape (contract C3) carries no alt key and copy.ts is owned by WP-04.
 */
const VIEWER_LABEL =
  'Interactive three dimensional ribbon model of green fluorescent protein, ' +
  'Protein Data Bank entry 1EMA. Eleven beta strands, drawn in blue, form a ' +
  'barrel around a single helix, drawn in green, that carries the group ' +
  'responsible for the protein glowing. Connecting loops are grey. The model ' +
  'turns slowly and can be dragged to rotate it.';

const STILL_ALT =
  'Three dimensional ribbon model of green fluorescent protein, Protein Data ' +
  'Bank entry 1EMA. Eleven beta strands, drawn in blue, form a barrel around ' +
  'a single helix, drawn in green, that carries the group responsible for the ' +
  'protein glowing. Connecting loops are grey.';

/** Spec section 5.4, --bp-md. Below this width the viewer is never loaded. */
const MOBILE_MAX_WIDTH = 720;

/** Spec section 9.5: load when within 1.5 viewport heights, above or below. */
const LOAD_ROOT_MARGIN = '150% 0px 150% 0px';

/** Spec section 7.6: roughly 0.2 degrees per frame on the Y axis. */
const DEG_PER_FRAME = 0.2;

/** Spec section 7.6: manual rotation pauses auto-rotation for 4s after release. */
const RESUME_DELAY_MS = 4000;

/**
 * setZoom maps 0..1 to camera zoom, pulling from a wide establishing shot to a
 * closer view. 1.0 is the fit produced by zoomTo(), so below 1 is wider.
 */
const ZOOM_WIDE = 0.78;
const ZOOM_CLOSE = 1.55;

/** Contract C9. */
export type Viewer3dHandle = {
  setZoom(p: number): void;
  destroy(): void;
};

/* ------------------------------------------------------------------ *
 * A narrow local view of 3Dmol.
 *
 * WP-01 wrote `declare module '3dmol';` in src/types.d.ts, so the import is
 * typed any. types.d.ts is not ours to edit, so the narrowing lives here.
 * ------------------------------------------------------------------ */

type CartoonAtom = { ss?: string };

type GLViewer = {
  addModel(data: string, format: string): unknown;
  setStyle(sel: Record<string, unknown>, style: Record<string, unknown>): unknown;
  zoomTo(): unknown;
  zoom(factor?: number): unknown;
  rotate(angle: number, axis?: string): unknown;
  render(): unknown;
  resize(): unknown;
  clear?(): unknown;
  getView?(): number[];
  setView?(view: number[]): unknown;
};

type Mol3dApi = {
  createViewer(
    el: HTMLElement,
    config: { backgroundColor: string; antialias: boolean },
  ): GLViewer;
};

/* ------------------------------------------------------------------ *
 * Capability checks
 * ------------------------------------------------------------------ */

function hasWebgl(): boolean {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl') ??
      probe.getContext('experimental-webgl');
    return gl !== null;
  } catch {
    return false;
  }
}

function useStill(): boolean {
  return !hasWebgl() || window.innerWidth < MOBILE_MAX_WIDTH;
}

/* ------------------------------------------------------------------ *
 * The static fallback
 * ------------------------------------------------------------------ */

function renderStill(el: HTMLElement): void {
  if (el.querySelector('.fx-viewer3d__still')) return;
  const img = document.createElement('img');
  img.className = 'fx-viewer3d__still';
  img.src = STILL_URL;
  // Explicit intrinsic size plus the reserved aspect-ratio box in the CSS
  // block means this contributes zero layout shift (spec section 12).
  img.width = STILL_W;
  img.height = STILL_H;
  img.alt = STILL_ALT;
  // The structure section is measured by a scroll scrub, so this is eager:
  // a late-loading image inside a measured section produces stale triggers
  // (spec section 7.3).
  img.loading = 'eager';
  img.decoding = 'async';
  el.appendChild(img);
}

/* ------------------------------------------------------------------ *
 * mountViewer3d
 * ------------------------------------------------------------------ */

/**
 * Mount the viewer into `el`.
 *
 * Returns a handle, or null when it fell back to the static still. The handle
 * is returned immediately: the 3Dmol import and the first render happen later,
 * on approach, and setZoom calls made before then are buffered and applied as
 * soon as the viewer exists. That keeps the caller from having to await a
 * promise that only settles when the user scrolls.
 */
export async function mountViewer3d(el: HTMLElement): Promise<Viewer3dHandle | null> {
  el.classList.add('fx-viewer3d');

  if (useStill()) {
    renderStill(el);
    return null;
  }

  const stage = document.createElement('div');
  stage.className = 'fx-viewer3d__stage';
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', VIEWER_LABEL);
  el.appendChild(stage);

  let viewer: GLViewer | null = null;
  let disposed = false;

  let zoomProgress = 0;
  let appliedFactor = 1;

  let rafId = 0;
  let looping = false;
  let onScreen = false;
  let dragging = false;
  let resumeAt = 0;

  let io: IntersectionObserver | null = null;
  let resizeRaf = 0;

  function applyZoom(): void {
    if (!viewer) return;
    const target = ZOOM_WIDE + zoomProgress * (ZOOM_CLOSE - ZOOM_WIDE);
    const relative = target / appliedFactor;
    if (Math.abs(relative - 1) < 0.001) return;
    appliedFactor = target;
    viewer.zoom(relative);
    viewer.render();
  }

  function tick(): void {
    if (!looping) return;
    rafId = window.requestAnimationFrame(tick);
    if (!viewer) return;
    if (dragging || Date.now() < resumeAt) return;
    // rotate() re-renders, so there is no second render call per frame.
    viewer.rotate(DEG_PER_FRAME, 'y');
  }

  function startLoop(): void {
    // Spec section 13.1: under reduced motion the structure does not
    // auto-rotate. It stays draggable, because 3Dmol owns that interaction.
    if (looping || disposed || !viewer) return;
    if (prefersReducedMotion()) return;
    if (!onScreen || document.hidden) return;
    looping = true;
    rafId = window.requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    // A viewer that keeps rendering off screen burns the frame budget.
    looping = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function onVisibilityChange(): void {
    if (document.hidden) stopLoop();
    else startLoop();
  }

  function onPointerDown(): void {
    dragging = true;
    stopLoop();
  }

  function onPointerUp(): void {
    if (!dragging) return;
    dragging = false;
    resumeAt = Date.now() + RESUME_DELAY_MS;
    startLoop();
  }

  function onResize(): void {
    if (resizeRaf) return;
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = 0;
      if (viewer && !disposed) viewer.resize();
    });
  }

  function attach(): void {
    stage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    io = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i += 1) {
          onScreen = entries[i].isIntersecting;
          if (onScreen) startLoop();
          else stopLoop();
        }
      },
      { rootMargin: '0px', threshold: 0 },
    );
    io.observe(el);
  }

  function detach(): void {
    stage.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (io) {
      io.disconnect();
      io = null;
    }
    if (resizeRaf) {
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
    }
  }

  async function load(): Promise<void> {
    if (disposed) return;
    try {
      // The one dynamic import. This is what keeps 3Dmol out of the initial
      // chunk (spec sections 9.5 and 12).
      const mod = (await import('3dmol')) as unknown as Mol3dApi & { default?: Mol3dApi };
      if (disposed) return;

      const api: Mol3dApi =
        typeof mod.createViewer === 'function' ? mod : (mod.default as Mol3dApi);

      const response = await fetch(STRUCTURE_URL);
      if (!response.ok) throw new Error('structure fetch failed: ' + String(response.status));
      const pdb = await response.text();
      if (disposed) return;

      const v = api.createViewer(stage, {
        backgroundColor: BACKGROUND, // --paper-sunk, never black
        antialias: true,
      });
      v.addModel(pdb, 'pdb');
      v.setStyle(
        {},
        {
          cartoon: {
            // Never the default spectrum or rainbow colouring.
            colorfunc: (atom: CartoonAtom): string =>
              SS_COLORS[atom.ss ?? 'c'] ?? SS_FALLBACK,
            thickness: 0.4,
            arrows: true,
          },
        },
      );
      v.zoomTo();
      v.render(); // nothing appears without this
      // Default lighting. No coloured lights are added.

      viewer = v;
      applyZoom();
      attach();
      // The observer callback sets onScreen, but if the element is already
      // intersecting the first callback arrives a frame later; this covers it.
      onScreen = true;
      startLoop();
    } catch (err) {
      // A failed load leaves a blank box, which is worse than the still.
      if (!disposed) {
        stage.remove();
        renderStill(el);
      }
      console.warn('viewer3d: falling back to the static still.', err);
    }
  }

  observeOnce(el, () => void load(), LOAD_ROOT_MARGIN);

  return {
    setZoom(p: number): void {
      const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
      if (clamped === zoomProgress) return;
      zoomProgress = clamped;
      applyZoom();
    },
    destroy(): void {
      if (disposed) return;
      disposed = true;
      stopLoop();
      detach();
      if (viewer) {
        try {
          if (typeof viewer.clear === 'function') viewer.clear();
        } catch {
          // The viewer is being thrown away either way.
        }
        viewer = null;
      }
      stage.remove();
    },
  };
}
