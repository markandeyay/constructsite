/* WP-11: does `font-display: optional` actually win on a genuinely cold load?

   Every run uses a brand new browser context, so the HTTP cache, the font cache
   and storage all start empty. The site registers no service worker, which the
   run asserts rather than assumes.

   `document.fonts.check()` is NOT a sufficient answer on its own: under
   font-display: optional a face that arrives after the block period still ends
   up loaded, so check() reports true while the page is painted in the fallback
   for the rest of the session. The reliable discriminator is the RENDERED
   headline: at 1440x900 Instrument Serif sets it in 5 lines and Georgia in 6, so
   the rendered height separates them cleanly. Both are reported.

   Usage: node qa/wp11-coldfont.mjs <url> <runsPerViewport> [throttle]
   throttle is one of: none, slow4g, fast3g
*/
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4411/';
const RUNS = Number(process.argv[3]) || 8;
const THROTTLE = process.argv[4] || 'none';
const VIEWS = [[1440, 900], [375, 812]];

const PROFILES = {
  none: null,
  // Lighthouse's Slow 4G: 1.6 Mbps down, 750 Kbps up, 150ms RTT.
  slow4g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150 },
  // Chrome DevTools Fast 3G: 1.6 Mbps down, 750 Kbps up, 562ms RTT.
  fast3g: { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 562 },
};
const profile = PROFILES[THROTTLE];
if (profile === undefined) { console.error('unknown throttle profile'); process.exit(2); }

const browser = await chromium.launch();

for (const [w, h] of VIEWS) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    if (profile) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile });
    }
    let fontFiles = 0;
    page.on('response', (r) => { if (r.url().includes('/fonts/') && r.url().endsWith('.woff2')) fontFiles++; });
    const t0 = Date.now();
    await page.goto(URL, { waitUntil: 'load' });
    const tLoad = Date.now() - t0;
    await page.waitForSelector('.sec-hero__title', { timeout: 60000 });
    // font-display: optional never swaps after the block period, so the paint
    // state cannot change from here. The wait is only for the load beats.
    await page.waitForTimeout(2800);
    const m = await page.evaluate(() => {
      const t = document.querySelector('.sec-hero__title');
      const cs = getComputedStyle(t);
      const st = document.querySelector('.sec-hero__status');
      let check = null;
      try { check = document.fonts.check(`${cs.fontSize} "Instrument Serif"`); } catch (e) { check = null; }
      return {
        check,
        lines: Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight)),
        titleH: Math.round(t.getBoundingClientRect().height),
        statusBottom: st ? Math.round(st.getBoundingClientRect().bottom) : null,
        vh: window.innerHeight,
        sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      };
    });
    rows.push({ run: i + 1, tLoad, fontFiles, ...m });
    await ctx.close();
  }

  // The webfont signature is the SMALLER rendered height at a given width.
  const heights = [...new Set(rows.map((r) => r.titleH))].sort((a, b) => a - b);
  const webfontH = heights[0];
  console.log(`\n=== ${w}x${h} | ${RUNS} cold loads | throttle=${THROTTLE} | ${URL} ===`);
  for (const r of rows) {
    const kind = r.titleH === webfontH ? 'webfont ' : 'FALLBACK';
    console.log(`  run ${String(r.run).padStart(2)}  load=${String(r.tLoad).padStart(6)}ms  rendered=${kind}  lines=${r.lines}  titleH=${r.titleH}  statusBottom=${r.statusBottom} / fold ${r.vh} ${r.statusBottom <= r.vh ? 'ABOVE' : 'BELOW by ' + (r.statusBottom - r.vh)}  fonts.check=${r.check}  woff2Fetched=${r.fontFiles}  swControlled=${r.sw}`);
  }
  const wf = rows.filter((r) => r.titleH === webfontH).length;
  const above = rows.filter((r) => r.statusBottom <= r.vh).length;
  console.log(`  SUMMARY ${w}x${h} throttle=${THROTTLE}: rendered heights seen ${JSON.stringify(heights)}, smallest treated as the webfont. ${wf}/${RUNS} cold loads rendered in it. Hero fully above the fold on ${above}/${RUNS}.`);
}
await browser.close();
