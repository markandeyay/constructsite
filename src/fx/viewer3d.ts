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
import { onScroll } from '../core/scroll';

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

/**
 * Spec section 7.6: roughly 0.2 degrees per frame on the Y axis. At 60Hz that
 * is 12 degrees per second, which is the rate that is actually visible, so the
 * rate is what this module holds constant. Steps are taken on an interval and
 * the angle is computed from elapsed time, so the structure turns at the spec's
 * speed whether the page is running at 60 frames a second or at 12.
 */
const DEG_PER_SECOND = 12;

/**
 * How often a rotation step is allowed. 20 steps a second at 0.6 degrees each
 * is the same visible speed as 60 steps at 0.2 degrees, and it is three times
 * fewer renders. A 3Dmol render is not free: measured at 279ms median at 6x CPU
 * throttle on the built page, so the number of renders is the whole ball game
 * for spec section 12's frame budget.
 */
const ROTATE_INTERVAL_MS = 50;

/** A pause must never unwind as one huge jump when rotation resumes. */
const MAX_STEP_DEG = 2;

/**
 * Scroll is considered active until this long after the last frame that moved.
 * Lenis broadcasts every frame while it eases, so this only has to cover the
 * gap between two broadcasts.
 */
const SCROLL_IDLE_MS = 160;

/** Zoom render cadence, while scrolling and once the page is still. */
const ZOOM_INTERVAL_SCROLL_MS = 180;
const ZOOM_INTERVAL_IDLE_MS = 60;

/** Camera moves smaller than this are not worth a render. */
const ZOOM_EPSILON = 0.012;

/**
 * ADAPTIVE RENDER RESOLUTION.
 *
 * A 3Dmol render is a WebGL draw followed by an OffscreenCanvas
 * transferToImageBitmap onto the visible canvas, and that transfer blocks the
 * main thread in proportion to the number of pixels. Measured on the built page
 * at 6x CPU throttle: one render of the 898x673 stage costs roughly 330ms, which
 * is a spec section 12 long-task failure on its own, before any question of how
 * often it happens. Rendering less often cannot fix a single render that is
 * already over 200ms. Rendering fewer pixels can.
 *
 * So the viewer renders at the resolution the device turns out to afford. It
 * starts at full resolution and steps the backing store down only after it has
 * measured renders that miss the budget below. The canvas is then stretched by
 * CSS to fill the same box, so the layout, the aspect and the reserved box are
 * untouched. On any machine where a render is cheap, which is every real
 * desktop this viewer loads on (below 720px it is never loaded at all), the
 * ladder never leaves step 0 and nothing about the image changes.
 */
const RENDER_SCALES = [1, 0.68, 0.5, 0.36];

/** A render that costs more than this is not affordable at the current size. */
const RENDER_BUDGET_MS = 80;

/** One slow render can be a garbage collection. Two in a row is the device. */
const SLOW_RENDERS_BEFORE_STEP = 2;

/**
 * Pacing. After a render that cost C, the next one waits C times this ratio, so
 * the viewer can never take more than a bounded share of the main thread
 * whatever the device. At 5ms a render, which is a real desktop, the wait is
 * 10ms and nothing is throttled at all.
 */
const RENDER_PACE_RATIO = 2;
const RENDER_PACE_MAX_MS = 400;

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
  setWidth(w: number): unknown;
  setHeight(h: number): unknown;
  clear?(): unknown;
  getView?(): number[];
  setView?(view: number[]): unknown;
};

/**
 * 3Dmol attaches a ResizeObserver and an IntersectionObserver of its own to the
 * element it is given, and both call its resize(), which re-derives the buffer
 * from the container AND renders. This module already observes intersection and
 * resize itself, so those two are duplicates: every time the section scrolls
 * into view they spend a full-resolution render that nothing asked for, which is
 * the single largest long task left during a scroll sweep. They are disconnected
 * and this module drives the same two events. Guarded, because they are
 * internals: if a future 3Dmol stops creating them, nothing here changes.
 */
type Watchers = {
  divwatcher?: { disconnect?: () => void };
  intwatcher?: { disconnect?: () => void };
};

type Mol3dApi = {
  createViewer(
    el: HTMLElement,
    config: { backgroundColor: string; antialias: boolean; upscale?: boolean },
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

  /** Set when setZoom has moved the target since the last applied render. */
  let zoomDirty = false;
  /** performance.now() of the last frame that actually rendered. */
  let lastRenderAt = 0;
  /** performance.now() of the last rotation step, for elapsed-time angles. */
  let lastRotateAt = 0;
  /** performance.now() of the last scroll frame with real movement. */
  let lastScrollAt = 0;
  /** Index into RENDER_SCALES. Steps down only, never up. */
  let scaleIndex = 0;
  /** Consecutive renders that missed RENDER_BUDGET_MS. */
  let slowRenders = 0;
  /** Cost of the last render, and when it finished, for pacing. */
  let lastRenderCost = 0;
  let lastRenderEnd = 0;
  let unsubscribeScroll: (() => void) | null = null;

  /**
   * 3Dmol sets the canvas inline width and height in CSS pixels to match the
   * backing store, so stepping the backing store down would shrink the picture.
   * The canvas is put back to filling its box after every size change.
   */
  function fillCanvas(): void {
    const canvas = stage.querySelector('canvas');
    if (!canvas) return;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }

  /**
   * setWidth and setHeight set the viewer's dimensions independently of the
   * container, which is exactly what is wanted here: the container keeps its
   * reserved box and the render buffer gets smaller. Neither call renders, so
   * this is free until the next render happens anyway.
   */
  function applyRenderScale(): void {
    if (!viewer) return;
    const scale = RENDER_SCALES[scaleIndex];
    const w = Math.max(1, Math.round(stage.clientWidth * scale));
    const h = Math.max(1, Math.round(stage.clientHeight * scale));
    viewer.setWidth(w);
    viewer.setHeight(h);
    fillCanvas();
  }

  /**
   * 3Dmol installs its own ResizeObserver and IntersectionObserver on the
   * element it was given, and both call its resize(), which re-derives the
   * buffer size from the container and undoes the step below. So the scale is
   * re-asserted before each render rather than set once. This is two property
   * reads when the ladder is at full resolution, which is every real desktop.
   */
  function ensureRenderScale(): void {
    if (scaleIndex === 0 || !viewer) return;
    const canvas = stage.querySelector('canvas');
    if (!canvas) return;
    const scale = RENDER_SCALES[scaleIndex];
    const ratio = window.devicePixelRatio || 1;
    const want = Math.max(1, Math.round(stage.clientWidth * scale)) * ratio;
    if (canvas.width !== want) applyRenderScale();
  }

  /**
   * Record what a render actually cost and, if the device cannot afford the
   * current size, step down far enough in one move. Cost tracks pixel count, so
   * the estimate for a candidate scale is the measured cost times the ratio of
   * the two areas.
   */
  function noteRenderCost(cost: number): void {
    lastRenderCost = cost;
    lastRenderEnd = performance.now();
    if (cost <= RENDER_BUDGET_MS) {
      slowRenders = 0;
      return;
    }
    slowRenders += 1;
    if (slowRenders < SLOW_RENDERS_BEFORE_STEP) return;
    const current = RENDER_SCALES[scaleIndex];
    let next = scaleIndex;
    for (let i = scaleIndex + 1; i < RENDER_SCALES.length; i += 1) {
      next = i;
      const area = (RENDER_SCALES[i] * RENDER_SCALES[i]) / (current * current);
      if (cost * area <= RENDER_BUDGET_MS) break;
    }
    if (next === scaleIndex) return;
    scaleIndex = next;
    slowRenders = 0;
    applyRenderScale();
  }

  /** Every 3Dmol render in this module is timed, so the ladder has data. */
  function timed(render: () => void): void {
    const before = performance.now();
    render();
    noteRenderCost(performance.now() - before);
  }

  /** True while the main thread still owes time for the previous render. */
  function pacedOut(now: number): boolean {
    const wait = Math.min(RENDER_PACE_MAX_MS, lastRenderCost * RENDER_PACE_RATIO);
    return now - lastRenderEnd < wait;
  }

  /**
   * Every render goes through here, so there is never more than one per frame.
   *
   * viewer.zoom() and viewer.rotate() each render on their own, so calling
   * render() after them is a second full render for nothing. That was costing
   * 582ms where a single render costs 279ms, measured at 6x CPU throttle.
   */
  function applyZoom(): void {
    if (!viewer) return;
    const target = ZOOM_WIDE + zoomProgress * (ZOOM_CLOSE - ZOOM_WIDE);
    const relative = target / appliedFactor;
    if (Math.abs(relative - 1) < ZOOM_EPSILON) {
      zoomDirty = false;
      return;
    }
    appliedFactor = target;
    zoomDirty = false;
    const v = viewer;
    ensureRenderScale();
    timed(() => v.zoom(relative)); // renders
  }

  function isScrolling(now: number): boolean {
    return now - lastScrollAt < SCROLL_IDLE_MS;
  }

  /**
   * One frame of the render budget.
   *
   * The rule is at most ONE 3Dmol render per frame, and never more often than
   * the interval the current state allows. A 3Dmol render of this structure
   * costs real main-thread milliseconds (it is a WebGL draw, but the draw call
   * itself blocks), so an unconditional render per frame is what pushed spec
   * section 12's janked-frame and long-task budgets over.
   */
  function tick(): void {
    if (!looping) return;
    rafId = window.requestAnimationFrame(tick);
    if (!viewer) return;

    const now = performance.now();
    // The previous render's own cost paces the next one, so a slow device
    // cannot spend the whole main thread in the viewer.
    if (pacedOut(now)) return;
    const scrolling = isScrolling(now);

    // The scrub owns the camera while the page is moving, so the zoom render
    // takes priority over the rotation step and gets its own coarser interval.
    if (zoomDirty) {
      const interval = scrolling ? ZOOM_INTERVAL_SCROLL_MS : ZOOM_INTERVAL_IDLE_MS;
      if (now - lastRenderAt >= interval) {
        applyZoom();
        lastRenderAt = now;
        // The rotation clock keeps running, so the visible rotation speed does
        // not change just because a zoom frame was spent.
        lastRotateAt = now;
      }
      return;
    }

    // Spec section 7.6 keeps the rotation continuous, but not while the camera
    // is already being moved by something else. Auto-rotation is suspended
    // while the user drags (spec section 7.6), for 4s after a drag release
    // (spec section 7.6), and while the page is actively scrolling. The third
    // case is the same argument as the first two: the view is already in
    // motion under the scrub, so a rotation step underneath it is invisible,
    // and it is the one that costs two full renders in the same frame.
    if (dragging || scrolling || Date.now() < resumeAt) {
      lastRotateAt = now;
      return;
    }

    if (now - lastRotateAt < ROTATE_INTERVAL_MS) return;

    // Angle is derived from elapsed time, not from a fixed per-frame step, so
    // the visible speed stays at the spec's rate whatever the frame rate is.
    // Capped so a long pause cannot produce one huge jump on resume.
    const elapsed = now - lastRotateAt;
    const angle = Math.min(MAX_STEP_DEG, (elapsed / 1000) * DEG_PER_SECOND);
    lastRotateAt = now;
    lastRenderAt = now;
    const v = viewer;
    ensureRenderScale();
    timed(() => v.rotate(angle, 'y')); // renders
  }

  function startLoop(): void {
    // Spec section 13.1: under reduced motion the structure does not
    // auto-rotate. It stays draggable, because 3Dmol owns that interaction.
    if (looping || disposed || !viewer) return;
    if (prefersReducedMotion()) return;
    if (!onScreen || document.hidden) return;
    looping = true;
    // Start the rotation clock now, so a pause (off screen, hidden tab, a drag)
    // never unwinds as one accumulated jump on the first frame back.
    lastRotateAt = performance.now();
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
      if (!viewer || disposed) return;
      viewer.resize(); // renders, and resets the size from the container
      applyRenderScale();
    });
  }

  function attach(): void {
    // core/scroll.ts is the only scroll driver on the page (spec section 6.3),
    // so this subscribes to its broadcast rather than attaching a listener of
    // its own. It is used for one thing: knowing whether the page is moving,
    // so the rotation step can stand down while the scrub owns the camera.
    unsubscribeScroll = onScroll((s) => {
      if (s.velocity !== 0) lastScrollAt = performance.now();
    });

    stage.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);

    io = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i += 1) {
          onScreen = entries[i].isIntersecting;
          if (onScreen) {
            // 3Dmol's own visibility handler is disconnected above, so the
            // buffer is re-asserted here instead. This does not render.
            ensureRenderScale();
            startLoop();
          } else {
            stopLoop();
          }
        }
      },
      { rootMargin: '0px', threshold: 0 },
    );
    io.observe(el);
  }

  function detach(): void {
    if (unsubscribeScroll) {
      unsubscribeScroll();
      unsubscribeScroll = null;
    }
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
        // 3Dmol defaults `upscale` to the antialias setting, which makes it
        // render to a buffer at twice the CSS size on any display that is not
        // already 2x, then downsample. That is four times the pixels for a
        // supersampling nicety on top of the antialiasing the context already
        // does. Measured on the built page at 6x CPU throttle: 264ms per
        // rotation render at 1796x1346 against 69ms at 640x480. Antialiasing
        // stays on, as spec section 9.2 requires. The 2x supersample does not.
        upscale: false,
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
      const firstRenderAt = performance.now();
      v.render(); // nothing appears without this
      const firstRenderCost = performance.now() - firstRenderAt;
      // Default lighting. No coloured lights are added.

      viewer = v;
      const watchers = v as unknown as Watchers;
      if (watchers.divwatcher && typeof watchers.divwatcher.disconnect === 'function') {
        watchers.divwatcher.disconnect();
      }
      if (watchers.intwatcher && typeof watchers.intwatcher.disconnect === 'function') {
        watchers.intwatcher.disconnect();
      }
      fillCanvas();
      // The one-time init render is the first evidence of what this device can
      // afford. It counts as one slow render, so a second slow one steps down.
      noteRenderCost(firstRenderCost);

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
      // This is called from a scroll scrub, so it must not render. It records
      // the target and the rAF loop applies it inside the render budget. If
      // the loop is not running (off screen, reduced motion, hidden tab) the
      // value is simply applied the next time a frame runs, or at load.
      const clamped = p < 0 ? 0 : p > 1 ? 1 : p;
      if (clamped === zoomProgress) return;
      zoomProgress = clamped;
      zoomDirty = true;
      if (!looping && viewer && onScreen && !document.hidden) {
        // Reduced motion never starts the loop, so the scrub still has to be
        // able to move the camera. One render, not one per frame.
        const now = performance.now();
        if (now - lastRenderAt >= ZOOM_INTERVAL_IDLE_MS) {
          applyZoom();
          lastRenderAt = now;
        }
      }
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
