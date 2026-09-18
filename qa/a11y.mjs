#!/usr/bin/env node
/**
 * qa/a11y.mjs
 * WP-16. Accessibility gate, spec sections 16.3, 13 and 16.6.
 *
 * Five checks:
 *   1. axe-core against the page at all three viewports. Any violation fails.
 *   2. Contrast on every text node against its COMPUTED background, walked up
 *      the ancestor chain until an opaque backdrop is found. Not the token
 *      table: the real rendered pair, per section 13.3.
 *   3. Tab traversal of the entire page, recording focus order, asserting no
 *      focus trap and no focused element that is invisible or off-screen.
 *   4. A reload with prefers-reduced-motion: reduce emulated, asserting that
 *      no element sits at opacity 0, that the How-it-works content is
 *      reachable, that Lenis is not installed, and that zero ScrollTrigger
 *      pins or scrubs are active. Section 13.1.
 *   5. Zero console errors and zero unhandled rejections. Section 16.6.
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

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 900, height: 1200 },
  { width: 1440, height: 900 },
];

const MAX_TAB_STOPS = 250;

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

  const results = [];
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
  return results;
};

/* ------------------------------------------------------------------ */
/* In-page: scroll the page so every reveal has fired                  */
/* ------------------------------------------------------------------ */

const SWEEP = async () => {
  const doc = document.documentElement;
  const step = Math.max(200, Math.round(window.innerHeight * 0.6));
  const max = () => Math.max(0, doc.scrollHeight - window.innerHeight);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y <= max(); y += step) {
    window.scrollTo(0, y);
    await wait(140);
  }
  window.scrollTo(0, max());
  await wait(500);
  window.scrollTo(0, 0);
  await wait(400);
};

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
    response = await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    await browser.close();
    console.log('  NOT READY: could not load ' + BASE);
    console.log('  Reason: ' + firstLine(err));
    console.log('  Start the preview server first:  npm run build && npm run preview');
    console.log('');
    process.exit(2);
  }
  if (!response || !response.ok()) {
    await browser.close();
    console.log('  NOT READY: ' + BASE + ' returned ' + (response ? response.status() : 'no response') + '.');
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
}

/* ------------------------------------------------------------------ */
/* Check 3: focus order                                                */
/* ------------------------------------------------------------------ */

async function focusAudit(page, label) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
  });

  const order = [];
  let previousKey = null;
  let repeats = 0;

  for (let i = 0; i < MAX_TAB_STOPS; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) {
        return { key: 'BODY', tag: 'body', visible: true, onScreen: true, text: '' };
      }
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      let key = el.tagName.toLowerCase();
      if (el.id) key += '#' + el.id;
      if (el.classList.length) key += '.' + Array.from(el.classList).join('.');
      key += '@' + Math.round(rect.top + window.scrollY) + ',' + Math.round(rect.left);
      const hiddenByStyle =
        cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0;
      const zeroSize = rect.width === 0 || rect.height === 0;
      const onScreen =
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth;
      return {
        key,
        tag: el.tagName.toLowerCase(),
        visible: !hiddenByStyle && !zeroSize,
        onScreen,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      };
    });

    if (stop.key === 'BODY') {
      /* Focus left the document. The traversal is complete. */
      break;
    }

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

    if (order.length > 0 && stop.key === order[0].key) {
      /* Wrapped around to the first stop: a complete, healthy cycle. */
      break;
    }

    order.push(stop);

    if (!stop.visible) {
      fail(label + ': focused element is not visible: ' + stop.key + ' (' + stop.text + ')');
    } else if (!stop.onScreen) {
      fail(label + ': focused element is off-screen after focus: ' + stop.key + ' (' + stop.text + ')');
    }
  }

  if (order.length >= MAX_TAB_STOPS) {
    fail(label + ': focus never cycled after ' + MAX_TAB_STOPS + ' Tab presses, which reads as a focus trap.');
  }

  console.log('  focus order: ' + order.length + ' stop(s)');
  order.forEach((s, i) => {
    console.log(
      '    ' + String(i + 1).padStart(3, ' ') + '. ' + s.tag + '  ' + (s.text || '(no text)') + '  [' + s.key + ']'
    );
  });
  return order;
}

/* ------------------------------------------------------------------ */
/* Check 4: reduced motion contract                                    */
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

  /* Lenis marks the root element and usually exposes an instance. */
  const lenisSignals = [];
  if (document.documentElement.classList.contains('lenis')) lenisSignals.push('html.lenis class present');
  if (document.documentElement.classList.contains('lenis-smooth')) lenisSignals.push('html.lenis-smooth class present');
  if (window.lenis) lenisSignals.push('window.lenis is set');
  if (window.__lenis) lenisSignals.push('window.__lenis is set');
  if (document.querySelector('[data-lenis-prevent]')) lenisSignals.push('a [data-lenis-prevent] element exists');

  /* ScrollTrigger: prefer the real API when the bundle exposes it, otherwise
     fall back to the pin-spacer elements ScrollTrigger injects. */
  let stMethod = 'pin-spacer DOM scan (ScrollTrigger is not exposed on window)';
  let pins = 0;
  let scrubs = 0;
  let total = 0;
  const ST = window.ScrollTrigger || (window.gsap && window.gsap.ScrollTrigger) || null;
  if (ST && typeof ST.getAll === 'function') {
    stMethod = 'ScrollTrigger.getAll()';
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
  console.log('ACCESSIBILITY GATE (spec sections 16.3, 13, 16.6)');
  console.log('target: ' + BASE);
  console.log('');

  if (!existsSync(AXE_PATH)) {
    console.log('  NOT READY: axe-core was not found at ' + AXE_PATH);
    console.log('  It is a section 3.3 devDependency installed by WP-01. Do not install it here.');
    console.log('');
    process.exit(2);
  }
  const axeSource = readFileSync(AXE_PATH, 'utf8');

  const browser = await chromium.launch();

  /* Checks 1, 2, 3 at each viewport. */
  for (const vp of VIEWPORTS) {
    const label = vp.width + 'x' + vp.height;
    console.log('--- ' + label + ' ---');
    const { context, page } = await openPage(browser, { viewport: vp });
    const gate = attachConsoleGate(page, label);
    await loadOrBail(page, browser);
    await page.evaluate(SWEEP);

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
    console.log('  computed-background contrast failures: ' + contrast.length);
    for (const c of contrast) {
      console.log(
        '    ' +
          c.selector +
          '  ratio ' +
          c.ratio +
          ' needs ' +
          c.required +
          (c.large ? ' (large text)' : '') +
          '  fg ' +
          c.color +
          ' on computed bg ' +
          c.background
      );
      console.log('        text: ' + JSON.stringify(c.text));
      fail(label + ': contrast ' + c.ratio + ':1 on ' + c.selector + ', needs ' + c.required + ':1');
    }

    /* 3. focus order */
    await focusAudit(page, label);

    await reportGate(page, gate);
    await context.close();
    console.log('');
  }

  /* Check 4: reduced motion, at the desktop viewport where pins would exist. */
  console.log('--- prefers-reduced-motion: reduce (section 13.1) ---');
  const { context: rmContext, page: rmPage } = await openPage(browser, {
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  });
  const rmGate = attachConsoleGate(rmPage, 'reduced-motion');
  await loadOrBail(rmPage, browser);
  await rmPage.evaluate(SWEEP);
  const rm = await rmPage.evaluate(REDUCED_MOTION_AUDIT);

  console.log('  media query matches reduce: ' + rm.reducedMotionMatches);
  console.log('  html.no-motion present:     ' + rm.noMotionClass);
  console.log('  elements at opacity 0:      ' + rm.zeroOpacity.length);
  for (const s of rm.zeroOpacity.slice(0, 30)) console.log('    ' + s);
  console.log('  #how present:               ' + rm.howPresent);
  console.log('  #how reachable:             ' + rm.howReachable + ' (text length ' + rm.howTextLength + ')');
  console.log('  Lenis signals:              ' + (rm.lenisSignals.length === 0 ? 'none' : rm.lenisSignals.join('; ')));
  console.log('  ScrollTrigger method:       ' + rm.stMethod);
  console.log('  triggers total/pins/scrubs: ' + rm.total + ' / ' + rm.pins + ' / ' + rm.scrubs);

  if (!rm.reducedMotionMatches) fail('reduced-motion: the emulation did not take effect in the page.');
  if (rm.zeroOpacity.length > 0) {
    fail('reduced-motion: ' + rm.zeroOpacity.length + ' element(s) remain at opacity 0. Section 13.1 forbids this.');
  }
  if (!rm.howPresent) fail('reduced-motion: there is no #how section in the document.');
  else if (!rm.howReachable) fail('reduced-motion: the How-it-works content is not reachable.');
  if (rm.lenisSignals.length > 0) {
    fail('reduced-motion: Lenis appears to be installed (' + rm.lenisSignals.join('; ') + '). Section 13.1 forbids this.');
  }
  if (rm.pins > 0) fail('reduced-motion: ' + rm.pins + ' ScrollTrigger pin(s) are active. Section 13.1 requires zero.');
  if (rm.scrubs > 0) fail('reduced-motion: ' + rm.scrubs + ' ScrollTrigger scrub(s) are active. Section 13.1 requires zero.');

  await reportGate(rmPage, rmGate);
  await rmContext.close();
  await browser.close();

  console.log('');
  if (failures.length > 0) {
    console.log('FAIL: ' + failures.length + ' accessibility violation(s).');
    for (const f of failures) console.log('  - ' + f);
    console.log('');
    process.exit(1);
  }
  console.log('PASS: axe clean, contrast clean at all three viewports, focus order sound,');
  console.log('      reduced-motion contract honoured, console gate clean.');
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
