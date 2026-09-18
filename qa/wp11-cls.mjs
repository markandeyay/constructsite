/* WP-11 CLS stress. Delays the entry module so the empty section shells are
   guaranteed to paint BEFORE mount() runs, which is the condition that exposes
   post-paint reflow from a JS added root class (the WP-09a bug class).
   Usage: node qa/wp11-cls.mjs [delayMs] [--css "<css appended after load>"] */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4411/';
const DELAY = Number(process.argv[2]) || 700;
const cssIdx = process.argv.indexOf('--css');
const EXTRA = cssIdx > -1 ? process.argv[cssIdx + 1] : '';

const VIEWS = [[375, 812], [414, 896], [768, 1024], [900, 1200], [1024, 768], [1440, 900], [1920, 1080]];
const INIT = `
  window.__cls = 0; window.__src = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls += e.value;
        for (const s of (e.sources || [])) {
          const n = s.node;
          window.__src.push({ v: Number(e.value.toFixed(5)), tag: n && n.tagName ? n.tagName.toLowerCase() : '?', id: (n && n.id) || '', cls: (n && String(n.className || '')).slice(0, 60) });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
`;

const browser = await chromium.launch();
for (const [w, h] of VIEWS) {
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(INIT);
    // Delay the entry chunk so first paint lands on the empty shells.
    await ctx.route('**/assets/index-*.js', async (route) => {
      await new Promise((r) => setTimeout(r, DELAY));
      await route.continue();
    });
    if (EXTRA) {
      // Patch the real stylesheet so the rule is present at FIRST PAINT.
      await ctx.route('**/assets/*.css', async (route) => {
        const res = await route.fetch();
        const body = await res.text();
        await route.fulfill({ response: res, body: body + '\n' + EXTRA, headers: { ...res.headers(), 'content-type': 'text/css' } });
      });
    }
    const errors = []; const rejects = [];
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => rejects.push(String(e)));
    await page.goto(BASE, { waitUntil: 'load' });

    await page.waitForTimeout(3500);
    const before = await page.evaluate(() => ({ cls: window.__cls, src: window.__src.slice(0, 8) }));
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.6);
      for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); }
      window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 400));
    });
    const after = await page.evaluate(() => ({ cls: window.__cls, src: window.__src.slice(0, 8) }));
    console.log(`${String(w).padEnd(5)}x${String(h).padEnd(5)} ${reduced ? 'rm ' : '   '} CLS_load=${before.cls.toFixed(4)} CLS_sweep=${after.cls.toFixed(4)} err=${errors.length} rej=${rejects.length}`);
    if (after.cls > 0) console.log('    sources: ' + JSON.stringify(after.src));
    if (errors.length) console.log('    errors: ' + JSON.stringify(errors.slice(0, 3)));
    await ctx.close();
  }
}
await browser.close();
