#!/usr/bin/env node
/**
 * qa/shots.mjs
 * WP-16. Screenshot sweep, spec sections 16.2 and 16.6.
 *
 * For each of the three viewports it scrolls the whole page first, so every
 * IntersectionObserver reveal has fired and any lazy media has loaded, returns
 * to the top, then captures one full-page shot plus one shot per section.
 *
 * Usage:  node qa/shots.mjs [baseUrl]
 * Default baseUrl: http://localhost:4173
 * Output: qa/shots/<width>x<height>/  (gitignored)
 * Exit:   0 on success, non-zero on a console error, an unhandled rejection,
 *         or a failure to capture.
 */

import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = join(HERE, 'shots');
const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '') + '/';

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 900, height: 1200 },
  { width: 1440, height: 900 },
];

/* Scrolls top to bottom in steps so reveals fire, then back to the top. */
const SWEEP = async () => {
  const doc = document.documentElement;
  const step = Math.max(200, Math.round(window.innerHeight * 0.6));
  const max = () => Math.max(0, doc.scrollHeight - window.innerHeight);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y <= max(); y += step) {
    window.scrollTo(0, y);
    await wait(160);
  }
  window.scrollTo(0, max());
  await wait(600);
  window.scrollTo(0, 0);
  await wait(500);
};

function firstLine(err) {
  const s = String(err && err.message ? err.message : err);
  return s.split(String.fromCharCode(10))[0];
}

async function main() {
  console.log('');
  console.log('SCREENSHOT SWEEP (spec section 16.2)');
  console.log('target: ' + BASE);
  console.log('output: ' + OUT_ROOT);
  console.log('');

  const browser = await chromium.launch();
  const failures = [];
  let captured = 0;

  try {
    rmSync(OUT_ROOT, { recursive: true, force: true });
  } catch {
    /* first run, nothing to clear */
  }
  mkdirSync(OUT_ROOT, { recursive: true });

  for (const vp of VIEWPORTS) {
    const label = vp.width + 'x' + vp.height;
    const dir = join(OUT_ROOT, label);
    mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await context.newPage();

    /* Section 16.6 gate. */
    const consoleErrors = [];
    const pageErrors = [];
    const rejections = [];
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
      await context.close();
      await browser.close();
      console.log('  NOT READY: could not load ' + BASE);
      console.log('  Reason: ' + firstLine(err));
      console.log('  Start the preview server first:  npm run build && npm run preview');
      console.log('');
      process.exit(2);
    }

    if (!response || !response.ok()) {
      await context.close();
      await browser.close();
      console.log('  NOT READY: ' + BASE + ' returned ' + (response ? response.status() : 'no response') + '.');
      console.log('');
      process.exit(2);
    }

    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll('main section[id]')).map((s) => s.id)
    );

    if (ids.length === 0) {
      await context.close();
      await browser.close();
      console.log('  NOT READY: the page loaded but contains zero mounted sections.');
      console.log('  Wave 3 has not landed yet. There is nothing to screenshot.');
      console.log('');
      process.exit(2);
    }

    console.log(label + ': ' + ids.length + ' section(s) found [' + ids.join(', ') + ']');

    await page.evaluate(SWEEP);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      /* a long-lived connection is not a failure for a screenshot run */
    }

    try {
      await page.screenshot({ path: join(dir, 'full-page.png'), fullPage: true });
      captured += 1;
      console.log('  captured full-page.png');
    } catch (err) {
      failures.push(label + ' full-page: ' + String(err && err.message ? err.message : err));
    }

    let index = 0;
    for (const id of ids) {
      index += 1;
      const name = String(index).padStart(2, '0') + '-' + id + '.png';
      try {
        const el = page.locator('#' + id);
        await el.scrollIntoViewIfNeeded({ timeout: 5000 });
        await page.waitForTimeout(350);
        await el.screenshot({ path: join(dir, name) });
        captured += 1;
        console.log('  captured ' + name);
      } catch (err) {
        failures.push(label + ' #' + id + ': ' + String(err && err.message ? err.message : err));
        console.log('  FAILED   ' + name + ': ' + String(err && err.message ? err.message : err));
      }
    }

    const pageRejections = await page.evaluate(() => window.__qaRejections || []);
    rejections.push(...pageRejections);

    console.log('  console errors: ' + consoleErrors.length + ', page errors: ' + pageErrors.length + ', rejections: ' + rejections.length);
    for (const e of consoleErrors) console.log('    console error: ' + e);
    for (const e of pageErrors) console.log('    page error:    ' + e);
    for (const e of rejections) console.log('    rejection:     ' + e);

    if (consoleErrors.length > 0) failures.push(label + ': ' + consoleErrors.length + ' console error(s), section 16.6 hard gate');
    if (pageErrors.length > 0) failures.push(label + ': ' + pageErrors.length + ' uncaught page error(s), section 16.6 hard gate');
    if (rejections.length > 0) failures.push(label + ': ' + rejections.length + ' unhandled rejection(s), section 16.6 hard gate');

    await context.close();
    console.log('');
  }

  await browser.close();

  console.log('captured ' + captured + ' image(s) into ' + resolve(OUT_ROOT));
  console.log('');

  if (failures.length > 0) {
    console.log('FAIL: ' + failures.length + ' problem(s).');
    for (const f of failures) console.log('  - ' + f);
    console.log('');
    process.exit(1);
  }

  console.log('PASS: every section captured at all three viewports, console gate clean.');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.log('');
  console.log('ERROR: the screenshot harness itself failed.');
  console.log('  ' + String(err && err.message ? err.message : err));
  console.log('');
  process.exit(3);
});
