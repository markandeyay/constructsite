#!/usr/bin/env node
/**
 * qa/a11y.mjs
 * Written by WP-16. EXTENDED by WP-14 (accessibility pass) per spec section
 * 16.3, which names this file as the accessibility gate and section 13 as its
 * subject.
 *
 * Checks, in the order they run:
 *   1.  axe-core against the page at all three viewports. Any violation fails.
 *   2.  Contrast on every text node against its COMPUTED background, walked up
 *       the ancestor chain until an opaque backdrop is found. Not the token
 *       table: the real rendered pair, per section 13.3. Every distinct pair is
 *       reported with its measured ratio, not only the failures.
 *   3.  Semantics, section 13.2: exactly one h1 and it is in the hero, sections
 *       use h2, cards use h3, every section carries aria-labelledby pointing at
 *       a real heading id, every section numeral is aria-hidden, the skip link
 *       is the first focusable element and targets #main.
 *   4.  Text alternatives, section 13.2: the plasmid map SVG carries role="img"
 *       and a real worded aria-label, and the 3D viewer (or the static still
 *       below 720px) carries a real description that is neither empty nor a
 *       filename.
 *   5.  Colour is never the only signal, section 13.4: the validation report
 *       carries PASS and WARN as text beside the swatches, and plasmid features
 *       carry text labels.
 *   6.  Form accessibility, section 10.7: a real <label> per control, no
 *       placeholder used as a label, aria-required on required fields,
 *       aria-live="polite" on the status line, and aria-invalid toggling on a
 *       failed validation (exercised by submitting the form empty).
 *   7.  Tab traversal of the entire page, recording focus order, asserting no
 *       focus trap, no focused element that is invisible or off-screen once the
 *       browser has finished scrolling it into view, a visible focus indicator
 *       at every stop, and the section 10.6 honeypot absent from the order.
 *   8.  Layout overlap: no two laid-out text-bearing elements' bounding boxes
 *       intersect, checked at nine scroll positions per viewport in both motion
 *       modes. Opacity assertions and CLS cannot see overlap, because parallax
 *       is a transform and transforms are excluded from layout-shift scoring.
 *   9.  A reload with prefers-reduced-motion: reduce emulated, asserting that
 *       no element sits at opacity 0, that the How-it-works content is
 *       reachable, that Lenis is not installed, and that zero ScrollTrigger
 *       pins or scrubs are active. Section 13.1.
 *   10. Zero console errors and zero unhandled rejections. Section 16.6.
 *
 * Usage:  node qa/a11y.mjs [baseUrl]
 * Default baseUrl: http://localhost:4173
 * Exit:   0 clean, 1 on a violation, 2 when the page is not ready, 3 on a
 *         harness error.
 */

import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const AXE_PATH = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '') + '/';

/**
 * The page is always opened with the `st-debug` query string. WP-10 put an
 * opt-in debug global behind it that exposes gsap and ScrollTrigger on
 * `window.__WP10`, precisely so the section 13.1 pin and scrub assertion can be
 * exact rather than a DOM scan for pin spacers. That global is scheduled for
 * removal before the production ship: this file therefore still falls back to
 * the pin-spacer scan and says which method it used.
 */
const TARGET = BASE + '?st-debug';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 900, height: 1200 },
  { width: 1440, height: 900 },
];

const MAX_TAB_STOPS = 250;
/** Scroll positions sampled by the overlap audit, as a fraction of the page. */
const OVERLAP_STOPS = 9;

const failures = [];
function fail(msg) {
  failures.push(msg);
}

/* ------------------------------------------------------------------ */
/* In-page: contrast on every text node against its computed backdrop  */
/* ------------------------------------------------------------------ */

const CONTRAST_AUDIT = () => {
  const parseColor = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[, /]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };

  const lum = (c) => {
    const f = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };

  const ratio = (a, b) => {
    const la = lum(a);
    const lb = lum(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };

  const over = (fg, bg) => {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  };

  /* Walk ancestors until an opaque backdrop is found, compositing any
     translucent layers encountered along the way. */
  const backdropOf = (el) => {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
    return base;
  };

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + Array.from(el.classList).slice(0, 3).join('.');
    return s;
  };

  const hex = (c) => {
    const h = (v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase();
    return '#' + h(c.r) + h(c.g) + h(c.b);
  };

  const results = [];
  const inventory = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = (textNode.nodeValue || '').trim();
    if (!text) continue;
    const el = textNode.parentElement;
    if (!el) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    if (el.closest('[aria-hidden="true"]')) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'title') continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    /* Off-screen utility text such as the honeypot and the skip link is not
       a rendered contrast pair. */
    if (rect.left < -2000 || rect.top < -5000) continue;

    const fg = parseColor(cs.color);
    if (!fg) continue;
    const bg = backdropOf(el);
    const composited = fg.a < 1 ? over(fg, bg) : fg;
    const r = ratio(composited, bg);

    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;

    /* Inventory of every DISTINCT rendered pair, per section 13.3. The key is
       the composited foreground, the resolved backdrop and the size class, so
       one row per real pair rather than one per text node. */
    const key = hex(composited) + ' on ' + hex(bg) + ' ' + (large ? 'large' : 'body');
    const entry = inventory.get(key);
    if (entry) {
      entry.count += 1;
      if (entry.examples.length < 3 && !entry.examples.includes(describe(el))) {
        entry.examples.push(describe(el));
      }
    } else {
      inventory.set(key, {
        fg: hex(composited),
        bg: hex(bg),
        large,
        required,
        ratio: Math.round(r * 100) / 100,
        fontSize: size,
        fontWeight: weight,
        count: 1,
        examples: [describe(el)],
      });
    }

    if (r + 0.005 < required) {
      results.push({
        selector: describe(el),
        text: text.slice(0, 60),
        color: cs.color,
        background: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')',
        fontSize: size,
        fontWeight: weight,
        large,
        required,
        ratio: Math.round(r * 100) / 100,
      });
    }
  }
  return { failures: results, inventory: Array.from(inventory.values()) };
};

/* ------------------------------------------------------------------ */
/* In-page: semantics, section 13.2                                    */
/* ------------------------------------------------------------------ */

const SEMANTICS_AUDIT = () => {
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + Array.from(el.classList).slice(0, 2).join('.');
    return s;
  };
  /* The accessible text of a heading. The hero headline is split per word for
     the clip reveal, with a visually hidden real copy and the visual copy
     marked aria-hidden, so the raw textContent reads double. Strip the
     aria-hidden subtrees the way an assistive technology would. */
  const accessibleText = (el) => {
    const clone = el.cloneNode(true);
    for (const h of Array.from(clone.querySelectorAll('[aria-hidden="true"]'))) h.remove();
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  const h1s = Array.from(document.querySelectorAll('h1')).map((h) => ({
    id: h.id,
    text: accessibleText(h),
    inHero: Boolean(h.closest('#hero')),
  }));

  const sections = Array.from(document.querySelectorAll('main section[id]')).map((s) => {
    const lb = s.getAttribute('aria-labelledby');
    const target = lb ? document.getElementById(lb) : null;
    return {
      id: s.id,
      labelledby: lb,
      targetExists: Boolean(target),
      targetTag: target ? target.tagName.toLowerCase() : null,
      targetText: target ? accessibleText(target) : null,
      h2Count: s.querySelectorAll('h2').length,
      h3Count: s.querySelectorAll('h3').length,
    };
  });

  const numerals = Array.from(document.querySelectorAll('.sec-head__num')).map((n) => ({
    text: (n.textContent || '').trim(),
    hidden: n.getAttribute('aria-hidden') === 'true',
    where: describe(n.closest('section') || n),
  }));

  /* Card titles must be h3. A card is anything carrying the shared .card class
     or a section-level card class that owns a title element. */
  const cardTitles = Array.from(document.querySelectorAll('.card__title, .sec-how__label')).map((t) => ({
    tag: t.tagName.toLowerCase(),
    text: accessibleText(t).slice(0, 40),
  }));

  const skip = document.querySelector('.skip-link');
  const skipHref = skip ? skip.getAttribute('href') : null;

  /* Heading order over the whole document, for the record. */
  const outline = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(
    (h) => h.tagName.toLowerCase() + ' ' + accessibleText(h).slice(0, 44)
  );

  return {
    h1s,
    sections,
    numerals,
    cardTitles,
    outline,
    skip: skip
      ? {
          href: skipHref,
          text: (skip.textContent || '').trim(),
          targetExists: Boolean(skipHref && document.querySelector(skipHref)),
          isFirstInDom: document.querySelector('a[href],button,input,select,textarea,[tabindex]') === skip,
        }
      : null,
  };
};

/* ------------------------------------------------------------------ */
/* In-page: text alternatives, section 13.2                            */
/* ------------------------------------------------------------------ */

const looksLikeFilename = (s) => /\.(png|jpe?g|webp|svg|gif|pdb|json)\b/i.test(String(s).trim());

const ALT_AUDIT = () => {
  /* The accessible name an assistive technology would compute for an element
     whose only naming route here is aria-label / aria-labelledby / alt /
     <title>. That is the full set of routes any of these three objects uses. */
  const nameOf = (el) => {
    if (!el) return null;
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const parts = lb
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((n) => (n.textContent || '').trim());
      if (parts.join(' ').trim()) return parts.join(' ').trim();
    }
    const al = el.getAttribute('aria-label');
    if (al !== null) return al.trim();
    if (el.tagName.toLowerCase() === 'img') return (el.getAttribute('alt') || '').trim();
    const t = el.querySelector(':scope > title');
    if (t) return (t.textContent || '').trim();
    return null;
  };

  /* The plasmid map. Section 13.2 puts role="img" and the worded label on the
     SVG itself, so look at the SVG first and report the wrapper separately, to
     distinguish "missing" from "present but on the wrong element". */
  const hosts = Array.from(document.querySelectorAll('.fx-plasmid'));
  const plasmid = hosts.map((host) => {
    const svg = host.querySelector('svg');
    return {
      host: host.className,
      hostRole: host.getAttribute('role'),
      hostName: nameOf(host),
      hasSvg: Boolean(svg),
      svgRole: svg ? svg.getAttribute('role') : null,
      svgName: svg ? nameOf(svg) : null,
      /* Every rendered feature label, section 13.4. seqviz draws them as SVG
         text nodes. */
      featureLabels: svg
        ? Array.from(svg.querySelectorAll('text'))
            .map((t) => (t.textContent || '').trim())
            .filter(Boolean)
        : [],
    };
  });

  /* The 3D structure: either a WebGL canvas inside a role="img" stage, or the
     static still below 720px (section 9.4). Exactly one of the two exists. */
  const stage = document.querySelector('.fx-viewer3d__stage');
  const still = document.querySelector('.fx-viewer3d__still');
  const structure = {
    mode: stage ? 'webgl canvas' : still ? 'static still' : 'neither',
    stageRole: stage ? stage.getAttribute('role') : null,
    stageName: stage ? nameOf(stage) : null,
    hasCanvas: Boolean(document.querySelector('.fx-viewer3d canvas')),
    stillSrc: still ? still.getAttribute('src') : null,
    stillAlt: still ? still.getAttribute('alt') : null,
  };

  return { plasmid, structure };
};

/* ------------------------------------------------------------------ */
/* In-page: colour is never the only signal, section 13.4              */
/* ------------------------------------------------------------------ */

const SIGNAL_AUDIT = () => {
  const rows = Array.from(document.querySelectorAll('.sec-validation__row')).map((row) => {
    const mark = row.querySelector('.sec-validation__mark');
    const word = row.querySelector('.sec-validation__word');
    const swatch = row.querySelector('.sec-validation__swatch');
    return {
      label: (row.querySelector('.sec-validation__label') || {}).textContent
        ? row.querySelector('.sec-validation__label').textContent.trim()
        : '',
      word: word ? (word.textContent || '').trim() : null,
      hasSwatch: Boolean(swatch),
      swatchHidden: swatch ? swatch.getAttribute('aria-hidden') === 'true' : null,
      markClass: mark ? mark.className : null,
      reason: row.querySelector('.sec-validation__reason')
        ? row.querySelector('.sec-validation__reason').textContent.trim()
        : null,
    };
  });
  return { rows };
};

/* ------------------------------------------------------------------ */
/* In-page: form accessibility, section 10.7                           */
/* ------------------------------------------------------------------ */

const FORM_AUDIT = () => {
  const form = document.querySelector('.form');
  if (!form) return { present: false };

  const controls = Array.from(form.querySelectorAll('input, select, textarea')).map((c) => {
    const inHoneypot = Boolean(c.closest('.form__honeypot'));
    const label = c.id ? form.querySelector('label[for="' + CSS.escape(c.id) + '"]') : null;
    return {
      id: c.id,
      name: c.getAttribute('name'),
      tag: c.tagName.toLowerCase(),
      type: c.getAttribute('type'),
      inHoneypot,
      tabindex: c.getAttribute('tabindex'),
      labelText: label ? (label.textContent || '').trim() : null,
      labelIsRealElement: Boolean(label),
      placeholder: c.getAttribute('placeholder'),
      required: c.hasAttribute('required'),
      ariaRequired: c.getAttribute('aria-required'),
      ariaInvalid: c.getAttribute('aria-invalid'),
    };
  });

  const status = form.querySelector('.form__status');
  return {
    present: true,
    controls,
    status: status
      ? { live: status.getAttribute('aria-live'), role: status.getAttribute('role'), text: (status.textContent || '').trim() }
      : null,
    submitDisabled: (form.querySelector('button[type="submit"], .btn--primary') || {}).disabled === true,
  };
};

/* ------------------------------------------------------------------ */
/* In-page: layout overlap                                             */
/* ------------------------------------------------------------------ */

/**
 * No two laid-out elements' bounding boxes may intersect.
 *
 * The check the build learned the hard way: WP-09a shipped a hero whose
 * headline overlapped the kicker while CLS read exactly 0.0000 and every
 * opacity assertion passed, because parallax is a transform and transforms are
 * excluded from layout-shift scoring by design.
 *
 * Scope, and why each exclusion is legitimate rather than convenient:
 *   - Only elements carrying their own direct text are compared. Wrappers
 *     legitimately contain each other.
 *   - Ancestor/descendant pairs are skipped for the same reason.
 *   - Anything inside a fixed, sticky or absolutely positioned box is skipped:
 *     the site header is a fixed overlay by design and is SUPPOSED to sit over
 *     the page, and the section 10.6 honeypot is absolutely positioned at
 *     left -9999px on purpose.
 *   - Anything with an ancestor at opacity 0 is skipped: a `.reveal` that has
 *     not fired yet sits 14px below its settled position, which is a pre-paint
 *     state no user ever sees, not a laid-out overlap.
 */
const OVERLAP_AUDIT = () => {
  const name = (e) =>
    e.tagName.toLowerCase() +
    (e.id ? '#' + e.id : '') +
    (e.classList.length ? '.' + Array.from(e.classList).slice(0, 2).join('.') : '');

  const els = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.closest('svg')) continue;

    let positioned = false;
    let transparent = false;
    let node = el;
    while (node && node.nodeType === 1) {
      const ncs = getComputedStyle(node);
      if (ncs.position === 'fixed' || ncs.position === 'sticky' || ncs.position === 'absolute') positioned = true;
      if (parseFloat(ncs.opacity) === 0) transparent = true;
      node = node.parentElement;
    }
    if (positioned || transparent) continue;

    let hasText = false;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 && (n.nodeValue || '').trim()) hasText = true;
    }
    if (!hasText) continue;

    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.left < -2000 || r.top < -5000) continue;
    els.push({ el, r });
  }

  const hits = [];
  for (let i = 0; i < els.length; i += 1) {
    for (let j = i + 1; j < els.length; j += 1) {
      const a = els[i];
      const b = els[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      /* One device pixel of tolerance: sub-pixel line boxes touch legitimately. */
      if (ox > 1 && oy > 1) {
        hits.push({
          a: name(a.el),
          b: name(b.el),
          ox: Math.round(ox),
          oy: Math.round(oy),
          ar: [Math.round(a.r.left), Math.round(a.r.top), Math.round(a.r.width), Math.round(a.r.height)],
          br: [Math.round(b.r.left), Math.round(b.r.top), Math.round(b.r.width), Math.round(b.r.height)],
        });
      }
    }
  }
  return { compared: els.length, hits };
};

/* ------------------------------------------------------------------ */
/* Scrolling: real wheel events, because Lenis reverts a programmatic  */
/* jump on the next frame and window.scrollY never leaves 0            */
/* ------------------------------------------------------------------ */

async function settle(page, ms) {
  await page.waitForTimeout(ms === undefined ? 700 : ms);
  /* Wait until the scroll position stops moving, so nothing is measured while
     Lenis is still easing. */
  let last = -1;
  for (let i = 0; i < 20; i += 1) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === last) return;
    last = y;
    await page.waitForTimeout(120);
  }
}

async function wheelTo(page, targetY) {
  const current = await page.evaluate(() => window.scrollY);
  let delta = Math.round(targetY - current);
  const sign = delta < 0 ? -1 : 1;
  delta = Math.abs(delta);
  for (let moved = 0; moved < delta; moved += 400) {
    await page.mouse.wheel(0, sign * Math.min(400, delta - moved));
    await page.waitForTimeout(40);
  }
  await settle(page);
}

/** A full sweep so every IntersectionObserver reveal has fired. */
async function sweep(page) {
  const max = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  );
  const step = await page.evaluate(() => Math.max(200, Math.round(window.innerHeight * 0.6)));
  for (let y = 0; y <= max; y += step) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(140);
  }
  await settle(page, 900);
  await wheelTo(page, 0);
  await settle(page, 600);
}

/* ------------------------------------------------------------------ */
/* Harness plumbing                                                    */
/* ------------------------------------------------------------------ */

function attachConsoleGate(page, label) {
  const state = { consoleErrors: [], pageErrors: [], label };
  page.on('console', (m) => {
    if (m.type() === 'error') state.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => state.pageErrors.push(String(e && e.message ? e.message : e)));
  return state;
}

const REJECTION_INIT = () => {
  window.__qaRejections = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__qaRejections.push(String((e && e.reason) || 'unknown rejection'));
  });
};

async function reportGate(page, state) {
  const rejections = await page.evaluate(() => window.__qaRejections || []);
  console.log(
    '  console gate: ' +
      state.consoleErrors.length +
      ' console error(s), ' +
      state.pageErrors.length +
      ' page error(s), ' +
      rejections.length +
      ' unhandled rejection(s)'
  );
  for (const e of state.consoleErrors) console.log('    console error: ' + e);
  for (const e of state.pageErrors) console.log('    page error:    ' + e);
  for (const e of rejections) console.log('    rejection:     ' + e);
  if (state.consoleErrors.length > 0) fail(state.label + ': console error(s), section 16.6 hard gate');
  if (state.pageErrors.length > 0) fail(state.label + ': uncaught page error(s), section 16.6 hard gate');
  if (rejections.length > 0) fail(state.label + ': unhandled promise rejection(s), section 16.6 hard gate');
}

async function openPage(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.addInitScript(REJECTION_INIT);
  return { context, page };
}

function firstLine(err) {
  const s = String(err && err.message ? err.message : err);
  return s.split(String.fromCharCode(10))[0];
}

async function loadOrBail(page, browser) {
  let response;
  try {
    response = await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    await browser.close();
    console.log('  NOT READY: could not load ' + TARGET);
    console.log('  Reason: ' + firstLine(err));
    console.log('  Start the preview server first:  npm run build && npm run preview');
    console.log('');
    process.exit(2);
  }
  if (!response || !response.ok()) {
    await browser.close();
    console.log('  NOT READY: ' + TARGET + ' returned ' + (response ? response.status() : 'no response') + '.');
    console.log('');
    process.exit(2);
  }
  const sections = await page.evaluate(() => document.querySelectorAll('main section[id]').length);
  if (sections === 0) {
    await browser.close();
    console.log('  NOT READY: the page loaded but contains zero mounted sections.');
    console.log('  Wave 3 has not landed yet. There is nothing to audit.');
    console.log('');
    process.exit(2);
  }
  /* The hero map mounts in a requestIdleCallback after first paint, so nothing
     is judged until it is there. */
  await page.waitForTimeout(2500);
}

/* ------------------------------------------------------------------ */
/* Check: focus order, section 13.2 and 10.7                           */
/* ------------------------------------------------------------------ */

const FOCUS_PROBE = () => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { key: 'BODY' };
  }
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  let key = el.tagName.toLowerCase();
  if (el.id) key += '#' + el.id;
  if (el.classList.length) key += '.' + Array.from(el.classList).join('.');
  key += '@' + Math.round(rect.top + window.scrollY) + ',' + Math.round(rect.left);

  const outlineWidth = parseFloat(cs.outlineWidth) || 0;
  const hasRing =
    (cs.outlineStyle !== 'none' && outlineWidth >= 1) || (cs.boxShadow && cs.boxShadow !== 'none');

  return {
    key,
    tag: el.tagName.toLowerCase(),
    name: el.getAttribute('name'),
    inHoneypot: Boolean(el.closest && el.closest('.form__honeypot')),
    visible:
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      parseFloat(cs.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0,
    onScreen:
      rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth,
    ring: hasRing,
    ringDetail: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
    text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
  };
};

async function focusAudit(page, label) {
  await wheelTo(page, 0);
  /* Reset the sequential focus navigation starting point. A bare blur() is not
     enough: Chromium remembers where focus last was and the next Tab resumes
     from there, which would silently start the traversal in the middle of the
     page. Focusing body moves the starting point back to the top. */
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    const b = document.body;
    b.setAttribute('tabindex', '-1');
    b.focus();
    b.removeAttribute('tabindex');
  });

  const order = [];
  let previousKey = null;
  let repeats = 0;

  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    await page.keyboard.press('Tab');

    /* The browser scrolls a newly focused control into view. Under Lenis that
       scroll is smoothed, so the element is legitimately off-screen for a few
       hundred milliseconds. Wait for the scroll to settle before asserting on
       position, or the assertion measures the animation rather than the site. */
    let stop = await page.evaluate(FOCUS_PROBE);
    if (stop.key !== 'BODY' && !stop.onScreen) {
      await settle(page, 300);
      stop = await page.evaluate(FOCUS_PROBE);
    }

    if (stop.key === 'BODY') break;

    if (stop.key === previousKey) {
      repeats += 1;
      if (repeats >= 2) {
        fail(label + ': focus trap. Focus stayed on ' + stop.key + ' across three consecutive Tab presses.');
        break;
      }
    } else {
      repeats = 0;
    }
    previousKey = stop.key;

    if (order.length > 0 && stop.key === order[0].key) break;

    order.push(stop);

    if (!stop.visible) {
      fail(label + ': focused element is not visible: ' + stop.key + ' (' + stop.text + ')');
    } else if (!stop.onScreen) {
      fail(label + ': focused element is off-screen after focus: ' + stop.key + ' (' + stop.text + ')');
    }
    if (!stop.ring) {
      fail(
        label +
          ': no visible focus indicator on ' +
          stop.key +
          ' (computed outline: ' +
          stop.ringDetail +
          '), spec section 10.7 and 13.2.'
      );
    }
    /* Section 10.6 places the honeypot off screen with tabindex -1. It must NOT
       appear in the focus order. That is correct behaviour, not a defect. */
    if (stop.inHoneypot || stop.name === 'website') {
      fail(label + ': the section 10.6 honeypot appeared in the focus order at stop ' + order.length + '.');
    }
  }

  if (order.length >= MAX_TAB_STOPS) {
    fail(label + ': focus never cycled after ' + MAX_TAB_STOPS + ' Tab presses, which reads as a focus trap.');
  }

  console.log('  focus order: ' + order.length + ' stop(s), visible ring at every stop: ' + order.every((s) => s.ring));
  order.forEach((s, i) => {
    console.log(
      '    ' +
        String(i + 1).padStart(3, ' ') +
        '. ' +
        s.tag +
        '  ' +
        (s.text || '(no text)') +
        '  ring[' +
        s.ringDetail +
        ']  [' +
        s.key +
        ']'
    );
  });

  /* The skip link must be the first focusable element and must target #main. */
  if (order.length === 0) {
    fail(label + ': nothing is focusable on the page.');
  } else {
    const first = order[0];
    const skip = await page.evaluate(() => {
      const s = document.querySelector('.skip-link');
      return s ? { href: s.getAttribute('href'), key: 'a.' + Array.from(s.classList).join('.') } : null;
    });
    if (!skip) fail(label + ': there is no skip link.');
    else {
      if (!first.key.startsWith('a.skip-link')) {
        fail(label + ': the skip link is not the first focusable element. First stop is ' + first.key + '.');
      }
      if (skip.href !== '#main') {
        fail(label + ': the skip link targets ' + skip.href + ', section 13.2 requires #main.');
      }
    }
  }

  return order;
}

/* ------------------------------------------------------------------ */
/* Check: overlap across the page at several scroll positions          */
/* ------------------------------------------------------------------ */

async function overlapAudit(page, label) {
  const max = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  );
  let total = 0;
  let compared = 0;
  for (let k = 0; k < OVERLAP_STOPS; k += 1) {
    const target = Math.round((max * k) / (OVERLAP_STOPS - 1));
    await wheelTo(page, target);
    const res = await page.evaluate(OVERLAP_AUDIT);
    compared = Math.max(compared, res.compared);
    total += res.hits.length;
    for (const h of res.hits) {
      fail(
        label +
          ': bounding boxes overlap at scrollY ' +
          target +
          ': ' +
          h.a +
          ' [' +
          h.ar.join(',') +
          '] intersects ' +
          h.b +
          ' [' +
          h.br.join(',') +
          '] by ' +
          h.ox +
          'x' +
          h.oy +
          'px'
      );
    }
  }
  await wheelTo(page, 0);
  console.log(
    '  overlap: ' +
      total +
      ' intersecting pair(s) across ' +
      OVERLAP_STOPS +
      ' scroll positions (up to ' +
      compared +
      ' text-bearing elements compared per position)'
  );
  return total;
}

/* ------------------------------------------------------------------ */
/* Check: the static audits that only need one viewport pass           */
/* ------------------------------------------------------------------ */

async function semanticsAudit(page, label) {
  const s = await page.evaluate(SEMANTICS_AUDIT);

  console.log('  headings: ' + s.h1s.length + ' h1');
  for (const h of s.h1s) console.log('    h1 #' + (h.id || '(no id)') + ' inHero=' + h.inHero + '  ' + h.text.slice(0, 50));
  if (s.h1s.length !== 1) fail(label + ': section 13.2 requires exactly one h1, found ' + s.h1s.length + '.');
  else if (!s.h1s[0].inHero) fail(label + ': the single h1 is not inside #hero.');

  console.log('  document outline:');
  for (const line of s.outline) console.log('    ' + line);

  for (const sec of s.sections) {
    console.log(
      '    section #' +
        sec.id +
        '  aria-labelledby=' +
        sec.labelledby +
        '  target=' +
        (sec.targetTag || 'MISSING') +
        '  h2=' +
        sec.h2Count +
        ' h3=' +
        sec.h3Count
    );
    if (!sec.labelledby) {
      fail(label + ': section #' + sec.id + ' has no aria-labelledby, section 13.2.');
      continue;
    }
    if (!sec.targetExists) {
      fail(label + ': section #' + sec.id + ' aria-labelledby points at "' + sec.labelledby + '", which does not exist.');
      continue;
    }
    /* Section 13.2: sections use h2. The hero is the stated exception, because
       the same clause puts the single h1 there and the hero is labelled by it. */
    const expected = sec.id === 'hero' ? 'h1' : 'h2';
    if (sec.targetTag !== expected) {
      fail(
        label +
          ': section #' +
          sec.id +
          ' is labelled by a <' +
          sec.targetTag +
          '>, section 13.2 requires <' +
          expected +
          '>.'
      );
    }
    if (sec.id !== 'hero' && sec.h2Count !== 1) {
      fail(label + ': section #' + sec.id + ' contains ' + sec.h2Count + ' h2 elements, expected exactly 1.');
    }
  }

  console.log('  section numerals: ' + s.numerals.map((n) => n.text + (n.hidden ? '(hidden)' : '(EXPOSED)')).join(' '));
  for (const n of s.numerals) {
    if (!n.hidden) fail(label + ': section numeral "' + n.text + '" in ' + n.where + ' is not aria-hidden="true".');
  }

  const badCards = s.cardTitles.filter((c) => c.tag !== 'h3');
  console.log('  card titles: ' + s.cardTitles.length + ', all h3: ' + (badCards.length === 0));
  for (const c of badCards) fail(label + ': card title "' + c.text + '" is a <' + c.tag + '>, section 13.2 requires h3.');

  if (!s.skip) fail(label + ': there is no skip link, section 13.2.');
  else {
    console.log('  skip link: "' + s.skip.text + '" -> ' + s.skip.href + '  targetExists=' + s.skip.targetExists);
    if (s.skip.href !== '#main') fail(label + ': the skip link targets ' + s.skip.href + ', not #main.');
    if (!s.skip.targetExists) fail(label + ': the skip link target ' + s.skip.href + ' does not exist.');
    if (!s.skip.isFirstInDom) fail(label + ': the skip link is not the first focusable element in the DOM.');
  }
  return s;
}

async function altAudit(page, label, viewportWidth) {
  const a = await page.evaluate(ALT_AUDIT);

  for (const m of a.plasmid) {
    console.log('  plasmid host .' + String(m.host).split(' ')[0] + '  svg=' + m.hasSvg);
    if (!m.hasSvg) {
      /* The How-it-works miniature does not mount below the motion gate. An
         unmounted container is not a missing label. */
      console.log('    (no SVG mounted in this container at this viewport)');
      continue;
    }
    console.log('    svg role=' + m.svgRole + '  accessible name length=' + (m.svgName ? m.svgName.length : 0));
    console.log('    name: ' + JSON.stringify(m.svgName));
    console.log('    feature text labels rendered: ' + m.featureLabels.length + '  ' + JSON.stringify(m.featureLabels.slice(0, 10)));
    if (m.svgRole !== 'img') {
      fail(label + ': the plasmid map SVG carries role="' + m.svgRole + '", section 13.2 requires role="img".');
    }
    if (!m.svgName || m.svgName.length === 0) {
      fail(
        label +
          ': the plasmid map SVG computes an EMPTY accessible name. Section 13.2 requires a real aria-label describing the construct and its features in words.' +
          (m.hostName ? ' The wrapper carries "' + m.hostName + '" instead.' : '')
      );
    } else if (m.svgName.length < 40) {
      fail(label + ': the plasmid map accessible name is only ' + m.svgName.length + ' characters, which is not a worded description.');
    }
    if (m.featureLabels.length === 0) {
      fail(label + ': the plasmid map renders zero text labels. Section 13.4 forbids conveying a feature by hue alone.');
    }
  }
  if (a.plasmid.length === 0) fail(label + ': no .fx-plasmid container exists on the page.');

  const st = a.structure;
  console.log('  3D structure: ' + st.mode);
  if (st.mode === 'webgl canvas') {
    console.log('    stage role=' + st.stageRole + '  name: ' + JSON.stringify(st.stageName));
    if (st.stageRole !== 'img') fail(label + ': the 3D viewer stage carries role="' + st.stageRole + '", expected role="img".');
    if (!st.stageName) fail(label + ': the 3D canvas has no text alternative, section 13.2.');
    else if (st.stageName.length < 40) fail(label + ': the 3D canvas text alternative is only ' + st.stageName.length + ' characters.');
    else if (looksLikeFilename(st.stageName)) fail(label + ': the 3D canvas text alternative reads as a filename: ' + st.stageName);
  } else if (st.mode === 'static still') {
    console.log('    still src=' + st.stillSrc);
    console.log('    still alt: ' + JSON.stringify(st.stillAlt));
    if (!st.stillAlt || st.stillAlt.trim().length === 0) {
      fail(label + ': the static structure still has empty alt text, section 13.2.');
    } else if (looksLikeFilename(st.stillAlt)) {
      fail(label + ': the static structure still alt text reads as a filename: ' + st.stillAlt);
    } else if (st.stillAlt.trim().length < 40) {
      fail(label + ': the static structure still alt text is only ' + st.stillAlt.trim().length + ' characters.');
    }
  } else {
    fail(label + ': the structure section rendered neither a WebGL canvas nor a static still.');
  }
  /* Section 9.4: below 720px 3Dmol must not load at all. */
  if (viewportWidth < 720 && st.hasCanvas) {
    fail(label + ': a WebGL canvas exists below 720px, where section 9.4 requires the static still.');
  }
  return a;
}

async function signalAudit(page, label) {
  const s = await page.evaluate(SIGNAL_AUDIT);
  console.log('  validation rows: ' + s.rows.length);
  for (const r of s.rows) {
    console.log(
      '    ' + r.label + '  word=' + JSON.stringify(r.word) + '  swatch=' + r.hasSwatch + ' (aria-hidden=' + r.swatchHidden + ')'
    );
    if (!r.word || !/^(PASS|WARN|FAIL)$/.test(r.word)) {
      fail(label + ': validation row "' + r.label + '" carries no PASS/WARN text beside its swatch, section 13.4.');
    }
    if (r.hasSwatch && r.swatchHidden !== true) {
      fail(label + ': the swatch on validation row "' + r.label + '" is not aria-hidden, so the status is announced twice.');
    }
  }
  if (s.rows.length === 0) fail(label + ': the validation report rendered zero rows.');
  const words = s.rows.map((r) => r.word);
  if (!words.includes('PASS')) fail(label + ': the validation report carries no PASS text label.');
  if (!words.includes('WARN')) fail(label + ': the validation report carries no WARN text label.');
  return s;
}

async function formAudit(page, label) {
  const f = await page.evaluate(FORM_AUDIT);
  if (!f.present) {
    fail(label + ': there is no contact form on the page.');
    return f;
  }
  console.log('  form controls: ' + f.controls.length);
  for (const c of f.controls) {
    if (c.inHoneypot) {
      console.log('    (honeypot) ' + c.name + '  tabindex=' + c.tabindex + '  [section 10.6, correctly excluded]');
      if (c.tabindex !== '-1') {
        fail(label + ': the honeypot field does not carry tabindex="-1", section 10.6.');
      }
      continue;
    }
    console.log(
      '    ' +
        c.tag +
        '#' +
        c.id +
        '  label=' +
        JSON.stringify(c.labelText) +
        '  required=' +
        c.required +
        '  aria-required=' +
        c.ariaRequired +
        '  placeholder=' +
        JSON.stringify(c.placeholder)
    );
    if (!c.labelIsRealElement || !c.labelText) {
      fail(label + ': control #' + c.id + ' has no real <label>, section 10.7.');
    }
    if (c.placeholder && c.labelText && c.placeholder.trim().toLowerCase() === c.labelText.trim().toLowerCase()) {
      fail(label + ': control #' + c.id + ' uses its placeholder as its label, section 10.7 forbids that.');
    }
    if (c.required && c.ariaRequired !== 'true') {
      fail(label + ': required control #' + c.id + ' does not carry aria-required="true", section 10.7.');
    }
  }

  if (!f.status) fail(label + ': the form has no status line.');
  else {
    console.log('    status line aria-live=' + f.status.live + '  text=' + JSON.stringify(f.status.text));
    if (f.status.live !== 'polite') {
      fail(label + ': the form status line carries aria-live="' + f.status.live + '", section 10.7 requires "polite".');
    }
  }

  /* aria-invalid must toggle on a failed validation. Exercise it by submitting
     the form empty: nothing is sent, because client-side validation rejects it
     before the fetch. */
  const before = f.controls.filter((c) => !c.inHoneypot && c.ariaInvalid === 'true').length;
  await page.evaluate(() => {
    const form = document.querySelector('.form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => {
    const form = document.querySelector('.form');
    if (!form) return { invalid: [], status: '' };
    return {
      invalid: Array.from(form.querySelectorAll('[aria-invalid="true"]')).map((e) => e.id || e.getAttribute('name')),
      status: (form.querySelector('.form__status') || {}).textContent || '',
    };
  });
  console.log(
    '    aria-invalid after an empty submit: ' +
      JSON.stringify(after.invalid) +
      '  (before: ' +
      before +
      ')  status: ' +
      JSON.stringify(after.status.trim())
  );
  if (after.invalid.length === 0) {
    fail(label + ': submitting the form empty set aria-invalid on no control, section 10.7 requires it to toggle.');
  }
  /* Put the form back the way it was found. */
  await page.evaluate(() => {
    const form = document.querySelector('.form');
    if (!form) return;
    for (const e of Array.from(form.querySelectorAll('[aria-invalid]'))) e.removeAttribute('aria-invalid');
    const s = form.querySelector('.form__status');
    if (s) s.textContent = '';
  });
  return f;
}

/* ------------------------------------------------------------------ */
/* Check: reduced motion contract, section 13.1                        */
/* ------------------------------------------------------------------ */

const REDUCED_MOTION_AUDIT = () => {
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + Array.from(el.classList).slice(0, 3).join('.');
    return s;
  };

  const zeroOpacity = [];
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (parseFloat(cs.opacity) === 0) zeroOpacity.push(describe(el));
  }

  const how = document.getElementById('how');
  const howRect = how ? how.getBoundingClientRect() : null;
  const howText = how ? (how.textContent || '').trim() : '';
  const howReachable = Boolean(
    how &&
      howRect &&
      howRect.height > 0 &&
      howText.length > 40 &&
      howRect.top + window.scrollY + howRect.height <= document.documentElement.scrollHeight + 2
  );
  /* Section 13.1: under reduced motion the How-it-works section renders as the
     stacked variant, so every one of the five steps must be readable. */
  const howSteps = how
    ? Array.from(how.querySelectorAll('.sec-how__step, .sec-how__label')).map((s) => {
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        return {
          text: (s.textContent || '').trim().slice(0, 24),
          height: Math.round(r.height),
          opacity: parseFloat(cs.opacity),
          visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.height > 0,
        };
      })
    : [];

  /* Lenis marks the root element and usually exposes an instance. */
  const lenisSignals = [];
  if (document.documentElement.classList.contains('lenis')) lenisSignals.push('html.lenis class present');
  if (document.documentElement.classList.contains('lenis-smooth')) lenisSignals.push('html.lenis-smooth class present');
  if (window.lenis) lenisSignals.push('window.lenis is set');
  if (window.__lenis) lenisSignals.push('window.__lenis is set');
  if (document.querySelector('[data-lenis-prevent]')) lenisSignals.push('a [data-lenis-prevent] element exists');

  /* ScrollTrigger. WP-10's opt-in `st-debug` global is the exact method and is
     tried first; the pin-spacer scan is the fallback for when that global is
     removed before the production ship. */
  let stMethod = 'pin-spacer DOM scan (no ScrollTrigger global is exposed)';
  let pins = 0;
  let scrubs = 0;
  let total = 0;
  const debug = window.__WP10 || null;
  const ST =
    (debug && debug.ScrollTrigger) || window.ScrollTrigger || (window.gsap && window.gsap.ScrollTrigger) || null;
  if (ST && typeof ST.getAll === 'function') {
    stMethod = debug && debug.ScrollTrigger === ST ? 'window.__WP10.ScrollTrigger.getAll() (st-debug)' : 'ScrollTrigger.getAll()';
    const all = ST.getAll();
    total = all.length;
    pins = all.filter((t) => Boolean(t.pin)).length;
    scrubs = all.filter((t) => t.vars && t.vars.scrub).length;
  } else {
    pins = document.querySelectorAll('.pin-spacer').length;
    total = pins;
  }

  return {
    zeroOpacity,
    howPresent: Boolean(how),
    howReachable,
    howTextLength: howText.length,
    howSteps,
    lenisSignals,
    stMethod,
    pins,
    scrubs,
    total,
    reducedMotionMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    noMotionClass: document.documentElement.classList.contains('no-motion'),
  };
};

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  console.log('');
  console.log('ACCESSIBILITY GATE (spec sections 13, 16.3, 16.6)');
  console.log('target: ' + TARGET);
  console.log('');

  if (!existsSync(AXE_PATH)) {
    console.log('  NOT READY: axe-core was not found at ' + AXE_PATH);
    console.log('  It is a section 3.3 devDependency installed by WP-01. Do not install it here.');
    console.log('');
    process.exit(2);
  }
  const axeSource = readFileSync(AXE_PATH, 'utf8');

  const browser = await chromium.launch();
  const contrastInventory = new Map();

  /* Checks 1 to 8 at each viewport. */
  for (const vp of VIEWPORTS) {
    const label = vp.width + 'x' + vp.height;
    console.log('--- ' + label + ' ---');
    const { context, page } = await openPage(browser, { viewport: vp });
    const gate = attachConsoleGate(page, label);
    await loadOrBail(page, browser);
    await sweep(page);

    /* 1. axe-core */
    await page.addScriptTag({ content: axeSource });
    const axeResults = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
    });
    console.log('  axe-core violations: ' + axeResults.length);
    for (const v of axeResults) {
      console.log('    [' + (v.impact || 'n/a') + '] ' + v.id + ': ' + v.help);
      for (const t of v.nodes) console.log('        ' + t);
      fail(label + ': axe violation ' + v.id + ' (' + v.help + ')');
    }

    /* 2. computed contrast */
    const contrast = await page.evaluate(CONTRAST_AUDIT);
    console.log('  distinct rendered text/background pairs: ' + contrast.inventory.length);
    contrast.inventory
      .slice()
      .sort((a, b) => a.ratio - b.ratio)
      .forEach((p) => {
        console.log(
          '    ' +
            String(p.ratio.toFixed(2)).padStart(6, ' ') +
            ':1  needs ' +
            p.required +
            '  ' +
            p.fg +
            ' on ' +
            p.bg +
            '  ' +
            Math.round(p.fontSize) +
            'px/' +
            p.fontWeight +
            (p.large ? ' large' : '') +
            '  x' +
            p.count +
            '  e.g. ' +
            p.examples[0]
        );
        const key = label + '|' + p.fg + '|' + p.bg + '|' + (p.large ? 'large' : 'body');
        if (!contrastInventory.has(key)) contrastInventory.set(key, { viewport: label, ...p });
      });
    console.log('  computed-background contrast failures: ' + contrast.failures.length);
    for (const c of contrast.failures) {
      console.log(
        '    ' + c.selector + '  ratio ' + c.ratio + ' needs ' + c.required + (c.large ? ' (large text)' : '') +
          '  fg ' + c.color + ' on computed bg ' + c.background
      );
      console.log('        text: ' + JSON.stringify(c.text));
      fail(label + ': contrast ' + c.ratio + ':1 on ' + c.selector + ', needs ' + c.required + ':1');
    }

    /* 3 to 5. semantics, text alternatives, signal redundancy */
    await semanticsAudit(page, label);
    await altAudit(page, label, vp.width);
    await signalAudit(page, label);

    /* 7. focus order. This runs BEFORE the form audit, which submits the form
       and therefore moves focus to the first invalid control. */
    await focusAudit(page, label);

    /* 6. form accessibility */
    await formAudit(page, label);

    /* 8. overlap, motion allowed */
    await overlapAudit(page, label + ' motion');

    await reportGate(page, gate);
    await context.close();
    console.log('');
  }

  /* 8b. overlap under reduced motion, at every viewport. */
  console.log('--- overlap under prefers-reduced-motion: reduce ---');
  for (const vp of VIEWPORTS) {
    const label = vp.width + 'x' + vp.height + ' reduced';
    const { context, page } = await openPage(browser, { viewport: vp, reducedMotion: 'reduce' });
    const gate = attachConsoleGate(page, label);
    await loadOrBail(page, browser);
    await sweep(page);
    console.log('  ' + label);
    await overlapAudit(page, label);
    await reportGate(page, gate);
    await context.close();
  }
  console.log('');

  /* 9. Reduced motion contract, at the desktop viewport where pins would exist. */
  console.log('--- prefers-reduced-motion: reduce (section 13.1) ---');
  const { context: rmContext, page: rmPage } = await openPage(browser, {
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const rmGate = attachConsoleGate(rmPage, 'reduced-motion');
  await loadOrBail(rmPage, browser);
  await sweep(rmPage);
  const rm = await rmPage.evaluate(REDUCED_MOTION_AUDIT);

  console.log('  media query matches reduce: ' + rm.reducedMotionMatches);
  console.log('  html.no-motion present:     ' + rm.noMotionClass);
  console.log('  elements at opacity 0:      ' + rm.zeroOpacity.length);
  for (const s of rm.zeroOpacity.slice(0, 30)) console.log('    ' + s);
  console.log('  #how present:               ' + rm.howPresent);
  console.log('  #how reachable:             ' + rm.howReachable + ' (text length ' + rm.howTextLength + ')');
  console.log('  #how steps visible:         ' + rm.howSteps.filter((s) => s.visible).length + ' / ' + rm.howSteps.length);
  for (const s of rm.howSteps) console.log('    ' + JSON.stringify(s.text) + ' h=' + s.height + ' opacity=' + s.opacity);
  console.log('  Lenis signals:              ' + (rm.lenisSignals.length === 0 ? 'none' : rm.lenisSignals.join('; ')));
  console.log('  ScrollTrigger method:       ' + rm.stMethod);
  console.log('  triggers total/pins/scrubs: ' + rm.total + ' / ' + rm.pins + ' / ' + rm.scrubs);

  if (!rm.reducedMotionMatches) fail('reduced-motion: the emulation did not take effect in the page.');
  if (rm.zeroOpacity.length > 0) {
    fail('reduced-motion: ' + rm.zeroOpacity.length + ' element(s) remain at opacity 0. Section 13.1 forbids this.');
  }
  if (!rm.howPresent) fail('reduced-motion: there is no #how section in the document.');
  else if (!rm.howReachable) fail('reduced-motion: the How-it-works content is not reachable.');
  if (rm.howSteps.length > 0 && rm.howSteps.some((s) => !s.visible)) {
    fail('reduced-motion: a How-it-works step is not rendered visibly, section 13.1.');
  }
  if (rm.lenisSignals.length > 0) {
    fail('reduced-motion: Lenis appears to be installed (' + rm.lenisSignals.join('; ') + '). Section 13.1 forbids this.');
  }
  if (rm.pins > 0) fail('reduced-motion: ' + rm.pins + ' ScrollTrigger pin(s) are active. Section 13.1 requires zero.');
  if (rm.scrubs > 0) fail('reduced-motion: ' + rm.scrubs + ' ScrollTrigger scrub(s) are active. Section 13.1 requires zero.');

  await reportGate(rmPage, rmGate);
  await rmContext.close();
  await browser.close();

  /* The full measured contrast table, once, across every viewport. */
  console.log('');
  console.log('MEASURED CONTRAST, EVERY DISTINCT RENDERED PAIR (section 13.3)');
  const all = Array.from(contrastInventory.values()).sort((a, b) => a.ratio - b.ratio);
  for (const p of all) {
    console.log(
      '  ' +
        p.viewport.padEnd(10, ' ') +
        String(p.ratio.toFixed(2)).padStart(6, ' ') +
        ':1  needs ' +
        p.required +
        '  ' +
        p.fg +
        ' on ' +
        p.bg +
        '  ' +
        Math.round(p.fontSize) +
        'px/' +
        p.fontWeight +
        (p.large ? ' large' : '') +
        '  e.g. ' +
        p.examples[0]
    );
  }
  if (all.length > 0) {
    const tightest = all[0];
    console.log(
      '  tightest pair: ' + tightest.ratio.toFixed(2) + ':1, ' + tightest.fg + ' on ' + tightest.bg + ' at ' + tightest.viewport
    );
  }

  console.log('');
  if (failures.length > 0) {
    console.log('FAIL: ' + failures.length + ' accessibility violation(s).');
    for (const f of failures) console.log('  - ' + f);
    console.log('');
    process.exit(1);
  }
  console.log('PASS: axe clean, contrast clean at all three viewports, semantics sound,');
  console.log('      text alternatives real, colour never the only signal, form operable,');
  console.log('      focus order sound with a visible ring at every stop, no overlapping');
  console.log('      boxes in either motion mode, reduced-motion contract honoured,');
  console.log('      console gate clean.');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.log('');
  console.log('ERROR: the accessibility harness itself failed.');
  console.log('  ' + String(err && err.message ? err.message : err));
  console.log('');
  process.exit(3);
});
