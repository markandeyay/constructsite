/**
 * fx/plasmid.ts
 *
 * The live circular plasmid map (spec section 8). Owner: WP-06.
 *
 * Contract C9:
 *   export type PlasmidPayload
 *   export function mountPlasmid(el, opts?): Promise<void>
 *   export function loadPlasmidPayload(): Promise<PlasmidPayload>
 *
 * Three rules this file exists to honour:
 *
 * 1. seqviz is mounted through its VANILLA entry point with an options object,
 *    never the JSX prop form. `Viewer(el, opts)` then `viewer.render()`.
 * 2. The draw-on-load animation post-processes the rendered SVG. seqviz is
 *    never patched, and no SVG attribute is tweened by GSAP. Everything is a
 *    CSS transition driven by a class toggle (spec section 6.2).
 * 3. Under reduced motion the map renders fully drawn. No element is ever left
 *    at opacity 0 (spec section 19). That is structural here: the armed class
 *    is the only thing that hides anything, and it is never added when
 *    `prefersReducedMotion()` is true.
 */

/* WP-15 (performance pass), narrow orchestrator-granted exception, and the
   ONLY change this package made to this file: the seqviz VALUE import became a
   dynamic import inside `mountPlasmid`, below. The type import stays, because a
   type import is erased at compile time and carries no runtime weight.

   Why this is not a budget dodge. Spec section 12 says seqviz is above the fold
   so it cannot be deferred the way 3Dmol is. That sentence is about deferring
   the MAP, not the IMPORT. The map still mounts exactly where it always did:
   after first paint, inside the `requestIdleCallback` of `afterFirstPaint()`
   required by spec section 8.6, with the Safari `setTimeout(0)` fallback. The
   import now happens in that same idle callback instead of in the entry chunk,
   which moves seqviz plus React and react-dom out of the initial bundle and
   changes no visual behaviour, no mount timing, no draw animation, no tooltip
   behaviour, no reduced-motion guarantee and no aria-label. */
import type { SeqVizProps } from 'seqviz';

import { prefersReducedMotion } from '../core/motion';

/** seqviz does not re-export AnnotationProp, so it is derived from the props. */
type SeqVizAnnotation = NonNullable<SeqVizProps['annotations']>[number];

/* ---------------------------------------------------------------------------
   Types
   ------------------------------------------------------------------------- */

export type PlasmidAnnotation = {
  name: string;
  start: number;
  end: number;
  direction: number;
  type?: string;
};

export type PlasmidPayload = {
  name: string;
  seq: string;
  length: number;
  annotations: PlasmidAnnotation[];
  _TODO?: string;
};

/* ---------------------------------------------------------------------------
   Feature colors
   ------------------------------------------------------------------------- */

/**
 * seqviz renders to SVG through React and cannot resolve CSS custom
 * properties, so these have to be hex literals.
 *
 * SYNC WARNING: every value below is a copy of a `--feat-*` token in
 * `src/styles/tokens.css` (spec section 5.2). tokens.css is the source of
 * truth. If a token changes there, change it here in the same edit, because
 * nothing in the build can detect the drift for you.
 *
 *   promoter   --feat-promoter    #2E6F95
 *   cds        --feat-cds         #1F6B4A
 *   marker     --feat-marker      #8A5E12
 *   origin     --feat-origin      #6B4A7A
 *   terminator --feat-terminator  #5C6570
 */
const FEATURE_COLORS: Record<string, string> = {
  promoter: '#2E6F95',
  cds: '#1F6B4A',
  marker: '#8A5E12',
  origin: '#6B4A7A',
  terminator: '#5C6570',
};

/** The order seqviz receives as its fallback palette for untyped features. */
const FEATURE_COLOR_LIST: string[] = [
  FEATURE_COLORS.promoter,
  FEATURE_COLORS.cds,
  FEATURE_COLORS.marker,
  FEATURE_COLORS.origin,
  FEATURE_COLORS.terminator,
];

/** Anything we cannot classify falls back to the terminator grey. */
const FALLBACK_TYPE = 'terminator';

/**
 * Name-pattern to feature-type mapping.
 *
 * The shipped placeholder payload carries an explicit `type` on every
 * annotation, so this never fires today. It exists because spec section 8.3
 * says a real export may not carry `type`, and when that export arrives it has
 * to drop in without a code change. Patterns are ordered most specific first
 * and are matched case-insensitively against the feature name.
 *
 * The full table is documented in `progress/WP-06.md`.
 */
const TYPE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Terminators before promoters: "T7 terminator" contains no promoter word,
  // but "rrnB T1 terminator" must not be caught by a looser rule later.
  [/\bterm(inator)?\b/i, 'terminator'],
  [/\bpolya\b|\bpoly-?a\s*signal\b/i, 'terminator'],

  // Origins of replication.
  [/\bori\b|\borigin\b|\bori[a-z0-9]{0,4}\b|\bp15a\b|\bpuc\b|\bpmb1\b|\bcolE1\b|\bf1\b|\bsv40 ori\b/i, 'origin'],
  [/\brep\b|\brepA\b|\boriT\b/i, 'origin'],

  // Selection markers: resistance genes and auxotrophic markers.
  [/(^|[^a-z])(amp|kan|cam|cat|tet|spec|strep|zeo|bla|neo|hyg|puro|bsd|gent)[a-z]?r?\b/i, 'marker'],
  [/\bresistance\b|\bselection marker\b|\bmarker\b/i, 'marker'],
  [/\b(leu2|ura3|his3|trp1|lys2)\b/i, 'marker'],

  // Promoters and other upstream regulatory elements.
  [/\bprom(oter)?\b|\bpromotor\b/i, 'promoter'],
  [/\b(t7|t3|sp6|lac|tac|trc|ara(bad)?|tet(o|r)?|cmv|ef1a?|sv40|pgk|ubc|cag|hsp70|gal1|adh1|tef1)\b/i, 'promoter'],
  [/\b(rbs|shine[- ]dalgarno|kozak|operator|enhancer|utr|ires|wpre|tata)\b/i, 'promoter'],

  // Coding sequences: explicit words first, then the common reporter and tag
  // names that show up in real exports without a CDS label.
  [/\bcds\b|\borf\b|\bgene\b|\bcoding\b|\bprotein\b|\bpeptide\b/i, 'cds'],
  [/\b(e?gfp|s?yfp|m?cherry|dsred|rfp|bfp|cfp|mscarlet|luciferase|luc|lacz)\b/i, 'cds'],
  [/\b(his6|6xhis|flag|myc|ha tag|strep-?tag|gst|mbp|sumo|tev|linker|signal peptide)\b/i, 'cds'],
];

/**
 * Resolve a feature type. An explicit `type` on the annotation always wins,
 * so a real export that carries the field never touches the pattern table.
 */
export function featureType(annotation: PlasmidAnnotation): string {
  const declared = (annotation.type ?? '').trim().toLowerCase();
  if (declared && declared in FEATURE_COLORS) return declared;

  const name = annotation.name ?? '';
  for (let i = 0; i < TYPE_PATTERNS.length; i += 1) {
    const [pattern, type] = TYPE_PATTERNS[i];
    if (pattern.test(name)) return type;
  }
  return FALLBACK_TYPE;
}

function featureColor(annotation: PlasmidAnnotation): string {
  return FEATURE_COLORS[featureType(annotation)] ?? FEATURE_COLORS[FALLBACK_TYPE];
}

/* ---------------------------------------------------------------------------
   Payload loading
   ------------------------------------------------------------------------- */

const PAYLOAD_URL = '/data/demo-plasmid.json';

let payloadPromise: Promise<PlasmidPayload> | null = null;

/**
 * Fetch the baked payload. The site never calls a product API (spec 2.2, 8.3).
 *
 * When the payload carries a `_TODO` key it is placeholder data, and this
 * prints a console WARNING. That warning is required by spec section 8.3: the
 * site must not ship a placeholder silently. It is deliberately a warning and
 * not an error, because spec section 16.6 makes console ERRORS a hard build
 * gate and a known placeholder must not fail that gate.
 */
export function loadPlasmidPayload(): Promise<PlasmidPayload> {
  if (payloadPromise) return payloadPromise;

  payloadPromise = fetch(PAYLOAD_URL)
    .then((res) => {
      if (!res.ok) {
        throw new Error('demo-plasmid.json responded ' + String(res.status));
      }
      return res.json() as Promise<PlasmidPayload>;
    })
    .then((payload) => {
      if (payload && typeof payload._TODO === 'string') {
        console.warn(
          '[plasmid] PLACEHOLDER DATA IN USE. ' +
            PAYLOAD_URL +
            ' carries a "_TODO" key, so the hero map is rendering demonstration ' +
            'data, not a real export. Replace the file and delete the key. ' +
            'Note: ' +
            payload._TODO,
        );
      }
      return payload;
    });

  return payloadPromise;
}

/* ---------------------------------------------------------------------------
   Timing (spec section 7.1 beats 6 to 8, and spec section 8.4)
   ------------------------------------------------------------------------- */

type Timeline = {
  backboneDur: number;
  arcsStart: number;
  arcStagger: number;
  arcDur: number;
  labelsStart: number;
  labelStagger: number;
  labelDur: number;
};

/** Desktop beats, measured from `m`, the moment seqviz reports mount complete. */
const DESKTOP: Timeline = {
  backboneDur: 1400, // m+0.00s, --ez-out-expo
  arcsStart: 700, // m+0.70s
  arcStagger: 90,
  arcDur: 600,
  labelsStart: 1500, // m+1.50s
  labelStagger: 40,
  labelDur: 400,
};

/** Spec section 7.1: on mobile the load animation runs, compressed to 1.6s. */
const MOBILE_TOTAL_MS = 1600;

/** The width at and below which the compressed mobile timeline is used. */
const MOBILE_MAX_WIDTH = 900;

function totalOf(t: Timeline, arcs: number, labels: number): number {
  const arcEnd = t.arcsStart + Math.max(0, arcs - 1) * t.arcStagger + t.arcDur;
  const labelEnd = t.labelsStart + Math.max(0, labels - 1) * t.labelStagger + t.labelDur;
  return Math.max(t.backboneDur, arcEnd, labelEnd);
}

function scaleTimeline(t: Timeline, k: number): Timeline {
  return {
    backboneDur: Math.round(t.backboneDur * k),
    arcsStart: Math.round(t.arcsStart * k),
    arcStagger: Math.round(t.arcStagger * k),
    arcDur: Math.round(t.arcDur * k),
    labelsStart: Math.round(t.labelsStart * k),
    labelStagger: Math.round(t.labelStagger * k),
    labelDur: Math.round(t.labelDur * k),
  };
}

function timelineFor(arcs: number, labels: number): Timeline {
  const full = totalOf(DESKTOP, arcs, labels);
  if (window.innerWidth > MOBILE_MAX_WIDTH || full <= MOBILE_TOTAL_MS) return DESKTOP;
  return scaleTimeline(DESKTOP, MOBILE_TOTAL_MS / full);
}

/* ---------------------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------------------- */

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/**
 * Spec section 8.6: mount after first paint. `requestIdleCallback` where it
 * exists, a `setTimeout(0)` fallback for Safari. The double rAF guarantees we
 * are past the first paint even when the idle callback fires immediately.
 */
function afterFirstPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    const run = (): void => {
      const idle = (window as IdleWindow).requestIdleCallback;
      if (typeof idle === 'function') {
        idle(() => resolve(), { timeout: 1200 });
      } else {
        window.setTimeout(resolve, 0);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  });
}

/** Poll for React 18 to flush its root. Bounded, so a failure never hangs. */
function waitFor<T>(read: () => T | null, timeoutMs = 4000): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const deadline = performance.now() + timeoutMs;
    const tick = (): void => {
      const value = read();
      if (value) {
        resolve(value);
        return;
      }
      if (performance.now() >= deadline) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function strand(direction: number): string {
  if (direction > 0) return 'forward strand';
  if (direction < 0) return 'reverse strand';
  return 'no strand';
}

function strandMark(direction: number): string {
  if (direction > 0) return '+';
  if (direction < 0) return '-';
  return '.';
}

/**
 * Spec section 13.2: a real aria-label describing the construct and its
 * features in words, not a filename.
 */
function describe(payload: PlasmidPayload): string {
  const features = payload.annotations
    .map(
      (a) =>
        a.name +
        ', a ' +
        featureType(a) +
        ', at base ' +
        String(a.start) +
        ' to ' +
        String(a.end) +
        ' on the ' +
        strand(a.direction),
    )
    .join('. ');

  return (
    'Circular map of the construct ' +
    payload.name +
    ', ' +
    String(payload.length) +
    ' base pairs, with ' +
    String(payload.annotations.length) +
    ' annotated features. ' +
    features +
    '.'
  );
}

/* ---------------------------------------------------------------------------
   SVG post-processing
   ------------------------------------------------------------------------- */

const CLS = {
  root: 'fx-plasmid',
  mini: 'fx-plasmid--mini',
  canvas: 'fx-plasmid__canvas',
  armed: 'fx-plasmid--armed',
  drawing: 'fx-plasmid--drawing',
  arcsIn: 'fx-plasmid--arcs-in',
  labelsIn: 'fx-plasmid--labels-in',
  backbone: 'fx-plasmid__backbone',
  arc: 'fx-plasmid__arc',
  label: 'fx-plasmid__label',
  tip: 'fx-plasmid__tip',
  tipOn: 'fx-plasmid__tip--on',
  active: 'fx-plasmid__arc--active',
};

type Ring = { cx: number; cy: number; r: number };

/**
 * Find the ring the backbone overlay has to match.
 *
 * seqviz composes the circular index line from two rotated half-arcs and
 * exposes no stable selector for a single backbone element, so `getTotalLength`
 * on "the backbone" has nothing reliable to grab (spec section 8.4). We measure
 * the union box of the index lines instead and derive a centre and a radius
 * from geometry we can see, which is a contract with the rendered picture
 * rather than with a third party's internal DOM shape.
 */
function findRing(svg: SVGSVGElement): Ring | null {
  const lines = svg.querySelectorAll<SVGGraphicsElement>('.la-vz-index-line');
  if (lines.length === 0) return null;

  // Union the index lines in SCREEN space, where every transform on the way
  // down has already been applied, then map one box back into the SVG's own
  // user space. That keeps the measurement independent of how many nested
  // groups and rotations seqviz happens to use today.
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < lines.length; i += 1) {
    const box = lines[i].getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.left < minX) minX = box.left;
    if (box.right > maxX) maxX = box.right;
    if (box.top < minY) minY = box.top;
    if (box.bottom > maxY) maxY = box.bottom;
  }

  if (minX === Number.POSITIVE_INFINITY || maxX - minX <= 0 || maxY - minY <= 0) {
    return null;
  }

  const screenCtm = svg.getScreenCTM();
  if (!screenCtm) return null;
  const inverse = screenCtm.inverse();

  const toUser = (x: number, y: number): { x: number; y: number } => ({
    x: inverse.a * x + inverse.c * y + inverse.e,
    y: inverse.b * x + inverse.d * y + inverse.f,
  });

  const topLeft = toUser(minX, minY);
  const bottomRight = toUser(maxX, maxY);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const height = Math.abs(bottomRight.y - topLeft.y);
  if (width <= 0 || height <= 0) return null;

  return {
    cx: (topLeft.x + bottomRight.x) / 2,
    cy: (topLeft.y + bottomRight.y) / 2,
    r: (width + height) / 4,
  };
}

/** Parse seqviz's `rotate(deg, cx, cy)` so the CSS transform can reproduce it. */
function parseRotate(value: string | null): { deg: number; cx: number; cy: number } | null {
  if (!value) return null;
  const m = /rotate\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(value);
  if (!m) return null;
  const deg = Number(m[1]);
  const cx = Number(m[2]);
  const cy = Number(m[3]);
  if (!Number.isFinite(deg) || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { deg, cx, cy };
}

/* ---------------------------------------------------------------------------
   Tooltip (spec section 8.5)
   ------------------------------------------------------------------------- */

type ArcRecord = { group: SVGGElement; annotation: PlasmidAnnotation };

function buildTooltip(): HTMLElement {
  const tip = document.createElement('div');
  tip.className = CLS.tip;
  tip.setAttribute('role', 'tooltip');
  return tip;
}

/** The tooltip's fade duration, so the node can leave the DOM after it. */
const TIP_FADE_MS = 240;

function wireInteraction(host: HTMLElement, tip: HTMLElement, arcs: ArcRecord[]): void {
  let current: SVGGElement | null = null;
  let removeTimer = 0;

  // The tooltip lives OUT of the DOM while it is not showing rather than
  // sitting at opacity 0. Spec section 19 and the section 16.3 sweep both
  // assert that no element is ever left at opacity 0, and an always-present
  // hidden tooltip is exactly the element that quietly breaks that.
  const hide = (): void => {
    if (current) {
      current.classList.remove(CLS.active);
      current = null;
    }
    if (!tip.isConnected) return;
    tip.classList.remove(CLS.tipOn);
    window.clearTimeout(removeTimer);
    removeTimer = window.setTimeout(() => {
      if (!tip.classList.contains(CLS.tipOn) && tip.parentNode) {
        tip.parentNode.removeChild(tip);
      }
    }, TIP_FADE_MS + 40);
  };

  const show = (record: ArcRecord, clientX: number, clientY: number): void => {
    if (current && current !== record.group) current.classList.remove(CLS.active);
    current = record.group;
    current.classList.add(CLS.active);

    const a = record.annotation;
    tip.textContent =
      a.name + '  ' + String(a.start) + '..' + String(a.end) + '  ' + strandMark(a.direction);

    const box = host.getBoundingClientRect();
    tip.style.left = (clientX - box.left).toFixed(1) + 'px';
    tip.style.top = (clientY - box.top).toFixed(1) + 'px';

    window.clearTimeout(removeTimer);
    if (!tip.isConnected) {
      host.appendChild(tip);
      // One forced style read so the browser has a start value to transition
      // from. Without it the node appears at full opacity in the same frame.
      void tip.offsetWidth;
    }
    tip.classList.add(CLS.tipOn);
  };

  for (let i = 0; i < arcs.length; i += 1) {
    const record = arcs[i];
    const group = record.group;

    // The hover class is added here, not in the animation pass, because the
    // interaction in spec section 8.5 is not gated on motion preference.
    group.classList.add(CLS.arc);

    group.addEventListener('pointerenter', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType !== 'mouse') return;
      show(record, pe.clientX, pe.clientY);
    });

    group.addEventListener('pointermove', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType !== 'mouse' || current !== group) return;
      show(record, pe.clientX, pe.clientY);
    });

    group.addEventListener('pointerleave', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      hide();
    });

    // Touch and pen: tap to show. No click behaviour beyond the tooltip, this
    // is not a product surface (spec section 8.5).
    group.addEventListener('pointerdown', (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType === 'mouse') return;
      if (current === group) {
        hide();
        return;
      }
      show(record, pe.clientX, pe.clientY);
    });
  }

  // Dismissed on the next tap elsewhere.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const pe = e as PointerEvent;
      if (pe.pointerType === 'mouse' || !current) return;
      const target = e.target as Node | null;
      if (target && current.contains(target)) return;
      hide();
    },
    true,
  );

  window.addEventListener('blur', hide);
}

/* ---------------------------------------------------------------------------
   The draw-on-load animation (spec section 8.4)
   ------------------------------------------------------------------------- */

function collectArcs(svg: SVGSVGElement, payload: PlasmidPayload): ArcRecord[] {
  const groups = svg.querySelectorAll<SVGGElement>('g[id$="-annotation-circular"]');
  const byName = new Map<string, PlasmidAnnotation[]>();
  for (let i = 0; i < payload.annotations.length; i += 1) {
    const a = payload.annotations[i];
    const bucket = byName.get(a.name);
    if (bucket) bucket.push(a);
    else byName.set(a.name, [a]);
  }

  const records: ArcRecord[] = [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    // seqviz puts the feature name in a <title> on the linear viewer only, so
    // match on the arc's own label text, then fall back to document order.
    const label = group.querySelector('textPath, text');
    const name = (label?.textContent ?? '').trim();
    const bucket = byName.get(name);
    const annotation = bucket && bucket.length > 0 ? bucket.shift() : payload.annotations[i];
    if (!annotation) continue;
    records.push({ group, annotation });
  }

  // Genomic order, which is the order the stagger has to run in.
  records.sort((a, b) => a.annotation.start - b.annotation.start);
  return records;
}

function armArcs(arcs: ArcRecord[], t: Timeline): void {
  for (let i = 0; i < arcs.length; i += 1) {
    const group = arcs[i].group;

    // Reproduce seqviz's rotate() in CSS so the scale composes with it instead
    // of replacing it. A CSS transform outranks the presentation attribute, so
    // the rotation has to be restated or the arc jumps to zero degrees.
    const rot = parseRotate(group.getAttribute('transform'));
    if (rot) {
      group.style.setProperty('--fx-rot', String(rot.deg) + 'deg');
      group.style.transformBox = 'view-box';
      group.style.transformOrigin = String(rot.cx) + 'px ' + String(rot.cy) + 'px';
    } else {
      // No parseable rotation: opacity only, never a transform that would move
      // the arc off its ring.
      group.style.setProperty('--fx-rot', '0deg');
    }

    group.style.setProperty('--fx-delay', String(t.arcsStart + i * t.arcStagger) + 'ms');
    group.style.setProperty('--fx-dur', String(t.arcDur) + 'ms');
  }
}

function armLabels(svg: SVGSVGElement, t: Timeline): number {
  const groups = svg.querySelectorAll<SVGGElement>('.la-vz-circular-labels > g');
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    group.classList.add(CLS.label);
    group.style.setProperty('--fx-delay', String(t.labelsStart + i * t.labelStagger) + 'ms');
    group.style.setProperty('--fx-dur', String(t.labelDur) + 'ms');
  }
  return groups.length;
}

function addBackbone(svg: SVGSVGElement, ring: Ring, t: Timeline): SVGCircleElement {
  const NS = 'http://www.w3.org/2000/svg';
  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('class', CLS.backbone);
  circle.setAttribute('cx', String(ring.cx));
  circle.setAttribute('cy', String(ring.cy));
  circle.setAttribute('r', String(ring.r));
  circle.setAttribute('fill', 'none');

  const circumference = 2 * Math.PI * ring.r;
  circle.style.setProperty('--fx-len', String(circumference));
  circle.style.setProperty('--fx-dur', String(t.backboneDur) + 'ms');
  svg.appendChild(circle);
  return circle;
}

/* ---------------------------------------------------------------------------
   Mount
   ------------------------------------------------------------------------- */

const mounted = new WeakSet<HTMLElement>();

/**
 * Mount the map into `el` and run the load animation.
 *
 * `el` is the reserved aspect-ratio box. It must already carry the
 * `.fx-plasmid` class in the section's own markup so the box exists before
 * this runs: the CLS budget in spec section 12 is exactly 0.00, so nothing may
 * shift when the map appears. The class is added here as well, defensively,
 * but that is a backstop and not the mechanism.
 */
export async function mountPlasmid(
  el: HTMLElement,
  opts?: { size?: number; mini?: boolean },
): Promise<void> {
  if (mounted.has(el)) return;
  mounted.add(el);

  el.classList.add(CLS.root);
  if (opts?.mini) el.classList.add(CLS.mini);
  if (typeof opts?.size === 'number' && opts.size > 0) {
    el.style.width = String(opts.size) + 'px';
  }

  // seqviz owns whatever element it renders into, so it gets its own child and
  // the tooltip stays a sibling of that child rather than a casualty of it.
  const canvas = document.createElement('div');
  canvas.className = CLS.canvas;
  el.appendChild(canvas);

  const tip = buildTooltip();

  await afterFirstPaint();

  // WP-15: seqviz is imported here, inside the spec section 8.6 idle callback,
  // rather than at module scope. Same mount moment, smaller entry chunk.
  const { Viewer } = await import('seqviz');

  const payload = await loadPlasmidPayload();

  const annotations: SeqVizAnnotation[] = payload.annotations.map((a) => ({
    name: a.name,
    start: a.start,
    end: a.end,
    direction: a.direction,
    color: featureColor(a),
  }));

  // The VANILLA entry point with an options object. The JSX prop form belongs
  // to seqviz's React component and does not exist here.
  const options: SeqVizProps = {
    name: payload.name,
    seq: payload.seq,
    annotations,
    primers: [],
    viewer: 'circular',
    showComplement: false,
    showIndex: !opts?.mini,
    disableExternalFonts: true,
    rotateOnScroll: false,
    colors: FEATURE_COLOR_LIST,
  };

  const viewer = Viewer(canvas, options);
  if (!viewer) return;
  viewer.render();

  // React 18 flushes its root asynchronously, so poll for the arcs themselves
  // rather than for the SVG shell, which lands a frame earlier.
  const svg = await waitFor<SVGSVGElement>(() => {
    const arc = canvas.querySelector<SVGGraphicsElement>('.la-vz-annotation');
    return arc?.ownerSVGElement ?? null;
  });
  if (!svg) return;

  // Spec section 13.2.
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', describe(payload));

  const arcs = collectArcs(svg, payload);
  wireInteraction(el, tip, arcs);

  // Spec section 19: reduced motion renders the map FULLY DRAWN. The armed
  // class is the only thing in this module that sets opacity 0, and this is
  // the only place it is added, so there is no path that can leave an element
  // hidden when reduced motion is on.
  if (prefersReducedMotion()) return;

  const labelCount = svg.querySelectorAll('.la-vz-circular-labels > g').length;
  const t = timelineFor(arcs.length, labelCount);

  armArcs(arcs, t);
  armLabels(svg, t);

  // seqviz's own ring and index ticks come back in with the first arc.
  el.style.setProperty('--fx-ring-delay', String(t.arcsStart) + 'ms');

  const ring = findRing(svg);
  const backbone = ring ? addBackbone(svg, ring, t) : null;

  el.classList.add(CLS.armed);

  // One frame with the armed state applied, then release. A class toggled in
  // the same frame the initial state was written does not transition.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (backbone) el.classList.add(CLS.drawing);
      el.classList.add(CLS.arcsIn);
      el.classList.add(CLS.labelsIn);
    });
  });

  // Remove the overlay once it has drawn, revealing seqviz's real ring under
  // it. A timer rather than transitionend, because a transition that never
  // fires must not be able to strand the overlay on top of the ring.
  const total = totalOf(t, arcs.length, labelCount);
  window.setTimeout(() => {
    if (backbone && backbone.parentNode) backbone.parentNode.removeChild(backbone);
    // Only the hiding classes come off. The settled classes stay, because they
    // hold the CSS transform that the arcs just animated INTO; dropping them
    // would hand the arcs back to seqviz's transform attribute in one frame,
    // and any rounding difference between the two would read as a jump.
    el.classList.remove(CLS.armed, CLS.drawing);
    for (let i = 0; i < arcs.length; i += 1) {
      arcs[i].group.style.removeProperty('--fx-delay');
    }
  }, total + 120);
}
