#!/usr/bin/env node
/**
 * qa/links.mjs
 * WP-16. Link resolution gate, spec sections 16.4 and 16.6.
 *
 * Every href on the page must resolve:
 *   - an internal "#id" anchor must point at an element that exists,
 *   - an external http/https link must answer 200,
 *   - a same-origin path must answer 200.
 * This is the check that catches an anchor pointing at a renamed section id.
 *
 * It additionally enforces BUILD_CONTRACT override A3 (eight sections, and no
 * #team anchor) and override A4 (no mailto link, no visible email address).
 *
 * Usage:  node qa/links.mjs [baseUrl]
 * Default baseUrl: http://localhost:4173
 * Exit:   0 clean, 1 on a broken link or gate violation, 2 when the page is
 *         not ready, 3 on a harness error.
 */

import { chromium, request as pwRequest } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '') + '/';

/* Override A3: eight sections, in this order, and no #team. */
const EXPECTED_SECTION_IDS = [
  'hero',
  'problem',
  'how',
  'outputs',
  'validation',
  'structure',
  'traction',
  'contact',
];
const BANNED_ANCHOR = '#team';

const failures = [];
function fail(msg) {
  failures.push(msg);
}

function describeLink(l) {
  return l.tag + ' "' + (l.text || l.label || '(no text)') + '" -> ' + l.href;
}

function firstLine(err) {
  const s = String(err && err.message ? err.message : err);
  return s.split(String.fromCharCode(10))[0];
}

async function main() {
  console.log('');
  console.log('LINK GATE (spec section 16.4, overrides A3 and A4)');
  console.log('target: ' + BASE);
  console.log('');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  /* Section 16.6 gate. */
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));
  await page.addInitScript(() => {
    window.__qaRejections = [];
    window.addEventListener('unhandledrejection', (e) => {
      window.__qaRejections.push(String((e && e.reason) || 'unknown rejection'));
    });
  });

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

  /* Scroll once so any deferred markup has mounted before links are read. */
  await page.evaluate(async () => {
    const doc = document.documentElement;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.round(window.innerHeight * 0.6));
    const max = () => Math.max(0, doc.scrollHeight - window.innerHeight);
    for (let y = 0; y <= max(); y += step) {
      window.scrollTo(0, y);
      await wait(120);
    }
    window.scrollTo(0, 0);
    await wait(300);
  });

  const page1 = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('[href]')).map((el) => ({
      tag: el.tagName.toLowerCase(),
      href: el.getAttribute('href') || '',
      resolved: el.href || '',
      text: (el.textContent || '').trim().slice(0, 50),
      label: el.getAttribute('aria-label') || '',
    }));
    const ids = Array.from(document.querySelectorAll('main section[id]')).map((s) => s.id);
    const allIds = Array.from(document.querySelectorAll('[id]')).map((n) => n.id);
    const names = Array.from(document.querySelectorAll('a[name]')).map((n) => n.getAttribute('name'));
    return { links, ids, allIds, names };
  });

  if (page1.ids.length === 0) {
    await browser.close();
    console.log('  NOT READY: the page loaded but contains zero mounted sections.');
    console.log('  Wave 3 has not landed yet. There is nothing to check.');
    console.log('');
    process.exit(2);
  }

  /* ---------------------------------------------------------------- */
  /* Override A3: section inventory                                    */
  /* ---------------------------------------------------------------- */

  console.log('SECTION INVENTORY (override A3)');
  console.log('  found ' + page1.ids.length + ': ' + page1.ids.join(', '));
  if (page1.ids.length !== EXPECTED_SECTION_IDS.length) {
    fail('expected ' + EXPECTED_SECTION_IDS.length + ' sections, found ' + page1.ids.length + ' (override A3)');
  }
  for (const id of EXPECTED_SECTION_IDS) {
    if (!page1.ids.includes(id)) fail('missing section shell #' + id + ' (override A3)');
  }
  for (const id of page1.ids) {
    if (!EXPECTED_SECTION_IDS.includes(id)) fail('unexpected section shell #' + id + ' (override A3)');
  }
  if (page1.allIds.includes('team')) fail('an element with id "team" exists. Override A2 deleted the team section.');
  console.log('');

  /* ---------------------------------------------------------------- */
  /* Link resolution                                                   */
  /* ---------------------------------------------------------------- */

  const anchorTargets = new Set([...page1.allIds, ...page1.names.filter(Boolean)]);
  const api = await pwRequest.newContext({ ignoreHTTPSErrors: false });

  const internal = [];
  const external = [];
  const sameOriginPaths = [];
  const skipped = [];

  for (const l of page1.links) {
    const href = l.href.trim();
    if (href === '') {
      fail('empty href on ' + l.tag + ' "' + l.text + '"');
      continue;
    }
    if (href.startsWith('#')) {
      internal.push(l);
    } else if (/^mailto:/i.test(href)) {
      fail('mailto link present: ' + describeLink(l) + '. Override A4 forbids a visible email address.');
    } else if (/^(tel:|javascript:|data:|blob:)/i.test(href)) {
      skipped.push(l);
    } else if (/^https?:\/\//i.test(href)) {
      const origin = new URL(BASE).origin;
      if (l.resolved.startsWith(origin)) sameOriginPaths.push(l);
      else external.push(l);
    } else {
      sameOriginPaths.push(l);
    }
  }

  console.log('INTERNAL ANCHORS: ' + internal.length);
  for (const l of internal) {
    const id = decodeURIComponent(l.href.slice(1));
    if (l.href === BANNED_ANCHOR) {
      fail('anchor to ' + BANNED_ANCHOR + ' present. Override A3 states there is no team section.');
      console.log('  BROKEN  ' + describeLink(l) + '  (banned anchor)');
      continue;
    }
    if (id === '' || id === 'top') {
      console.log('  ok      ' + describeLink(l) + '  (document top)');
      continue;
    }
    if (anchorTargets.has(id)) {
      console.log('  ok      ' + describeLink(l));
    } else {
      fail('internal anchor ' + l.href + ' has no matching element id. ' + describeLink(l));
      console.log('  BROKEN  ' + describeLink(l));
    }
  }

  console.log('');
  console.log('SAME-ORIGIN PATHS: ' + sameOriginPaths.length);
  for (const l of sameOriginPaths) {
    const url = l.resolved || new URL(l.href, BASE).toString();
    try {
      const r = await api.get(url, { timeout: 20000 });
      if (r.status() === 200) {
        console.log('  ok  200 ' + url);
      } else {
        fail('same-origin link returned ' + r.status() + ': ' + url);
        console.log('  BAD ' + r.status() + ' ' + url);
      }
    } catch (err) {
      fail('same-origin link failed: ' + url + ' (' + String(err && err.message ? err.message : err) + ')');
      console.log('  ERR     ' + url);
    }
  }

  console.log('');
  console.log('EXTERNAL LINKS: ' + external.length);
  const checkedExternal = new Map();
  for (const l of external) {
    const url = l.resolved || l.href;
    if (checkedExternal.has(url)) {
      console.log('  ok  ' + checkedExternal.get(url) + ' ' + url + '  (already checked)');
      continue;
    }
    let status = 0;
    let note = '';
    try {
      let r = await api.fetch(url, { method: 'HEAD', timeout: 25000, maxRedirects: 5 });
      status = r.status();
      if (status === 405 || status === 403 || status === 501) {
        r = await api.get(url, { timeout: 25000, maxRedirects: 5 });
        status = r.status();
        note = ' (HEAD refused, retried with GET)';
      }
    } catch (err) {
      fail('external link could not be reached: ' + url + ' (' + String(err && err.message ? err.message : err) + ')');
      console.log('  ERR     ' + url);
      continue;
    }
    checkedExternal.set(url, status);
    if (status === 200) {
      console.log('  ok  200 ' + url + note);
    } else {
      fail('external link returned ' + status + ' rather than 200: ' + url);
      console.log('  BAD ' + status + ' ' + url + note);
    }
  }

  if (skipped.length > 0) {
    console.log('');
    console.log('SKIPPED (not resolvable over HTTP): ' + skipped.length);
    for (const l of skipped) console.log('  ' + describeLink(l));
  }

  /* ---------------------------------------------------------------- */
  /* Override A4: no visible email address in the rendered text        */
  /* ---------------------------------------------------------------- */

  const emails = await page.evaluate(() => {
    const text = document.body.innerText || '';
    const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    return Array.from(new Set(text.match(re) || []));
  });
  console.log('');
  console.log('RENDERED EMAIL ADDRESSES (override A4): ' + emails.length);
  for (const e of emails) {
    console.log('  FOUND ' + e);
    fail('a rendered email address is visible on the page. Override A4 forbids this.');
  }

  /* ---------------------------------------------------------------- */
  /* Section 16.6 console gate                                         */
  /* ---------------------------------------------------------------- */

  const rejections = await page.evaluate(() => window.__qaRejections || []);
  console.log('');
  console.log('CONSOLE GATE (section 16.6)');
  console.log('  console errors:       ' + consoleErrors.length);
  console.log('  page errors:          ' + pageErrors.length);
  console.log('  unhandled rejections: ' + rejections.length);
  for (const e of consoleErrors) console.log('    console error: ' + e);
  for (const e of pageErrors) console.log('    page error:    ' + e);
  for (const e of rejections) console.log('    rejection:     ' + e);
  if (consoleErrors.length > 0) fail(consoleErrors.length + ' console error(s), section 16.6 hard gate');
  if (pageErrors.length > 0) fail(pageErrors.length + ' uncaught page error(s), section 16.6 hard gate');
  if (rejections.length > 0) fail(rejections.length + ' unhandled promise rejection(s), section 16.6 hard gate');

  await api.dispose();
  await context.close();
  await browser.close();

  console.log('');
  if (failures.length > 0) {
    console.log('FAIL: ' + failures.length + ' violation(s).');
    for (const f of failures) console.log('  - ' + f);
    console.log('');
    process.exit(1);
  }
  console.log('PASS: every href resolves, section inventory matches override A3, console gate clean.');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.log('');
  console.log('ERROR: the link harness itself failed.');
  console.log('  ' + String(err && err.message ? err.message : err));
  console.log('');
  process.exit(3);
});
