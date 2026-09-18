#!/usr/bin/env node
/**
 * qa/perf.mjs
 * WP-16. Performance sweep, spec sections 16.1, 16.6 and the section 12 budgets.
 *
 * Measurement approach (recorded per section 16.1, which asks for this):
 *   FRAME DELTAS come from a requestAnimationFrame loop injected into the page
 *   before any document script runs. Each callback pushes the delta between
 *   consecutive rAF timestamps into an array on window. There is no
 *   frame-timing entry type in the Performance API, so this is the measurement,
 *   not a fallback. CDP Tracing was the stated alternative and was not used.
 *   LONG TASKS come from a PerformanceObserver on { type: 'longtask' }, which
 *   does exist, with buffered: true so tasks before the observer attaches are
 *   still captured.
 *   TOTAL SCRIPT TIME comes from CDP Performance.getMetrics, ScriptDuration.
 *   CPU THROTTLE is CDP Emulation.setCPUThrottlingRate at 6x.
 *
 * Usage:  node qa/perf.mjs [baseUrl]
 * Default baseUrl: http://localhost:4173  (the vite preview port)
 * Exit:   0 when every budget holds, non-zero otherwise.
 *
 * WP-15 (performance pass) extended this script in three ways. Each is a
 * correction or an addition, never a relaxed budget. The section 12 numbers
 * themselves are untouched.
 *
 *   1. LONG TASKS ARE JUDGED OVER THE SWEEP, NOT OVER THE WHOLE RUN. Section 12
 *      reads "long tasks > 200ms DURING SCROLL SWEEP". The first version tested
 *      every long task in the run, so page-load work was reported as a scroll
 *      failure. Boot long tasks are still printed in full, under their own
 *      heading, because they are real: their budget is Total Blocking Time
 *      (section 12, measured by Lighthouse), not this one.
 *   2. THE SWEEP STARTS WHEN THE PAGE IS QUIET. The fixed 2500ms settle
 *      sometimes began the sweep while the one-time seqviz mount was still
 *      running at 6x throttle, which put boot work inside the sweep window and
 *      made the jank percentage swing between 0.55% and 4.81% run to run on an
 *      unchanged page. The sweep now waits for a quiet period with no long task
 *      (QUIET_MS), capped by SETTLE_MAX_MS, and prints when it started and why.
 *   4. THE SWEEP IS DRIVEN BY REAL WHEEL EVENTS. window.scrollTo moved this
 *      page 12px in 8 seconds because Lenis reverts a programmatic jump on the
 *      next frame, so every earlier frame number described a page that never
 *      scrolled. The script now asserts the sweep reached the bottom.
 *   3. A SECOND PASS MEASURES CLS WITH A STEPPED SWEEP. Section 12 budgets CLS
 *      at exactly 0.00. WP-11 proved that a smooth sweep hides a shift a
 *      stepped sweep exposes (0.0001 against 0.0197 on the same page), and that
 *      the entry chunk has to be delayed so the empty shells paint first or the
 *      harness cannot see the defect class at all. Both are reproduced here.
 */

import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '') + '/';

/* Section 12 budgets. */
const BUDGET_MEDIAN_MS = 12;
const BUDGET_JANK_PCT = 2;
const JANK_THRESHOLD_MS = 20;
const LONGTASK_FAIL_MS = 200;

/* Sweep shape, section 16.1. */
const SWEEP_MS = 8000;
const CPU_THROTTLE = 6;

/* Settle, WP-15. The sweep must measure scrolling, not the tail of boot. */
const QUIET_MS = 1200;        /* no long task for this long means the page is quiet */
const SETTLE_MIN_MS = 2500;   /* never sweep sooner than the original fixed settle */
const SETTLE_MAX_MS = 20000;  /* and never wait longer than this, quiet or not */

/* CLS pass, WP-15. Section 12 budgets CLS at exactly 0.00, so anything that
   does not round to 0.00 at two decimal places is a failure. The raw value is
   always printed, never the rounded one. */
const CLS_FAIL_AT = 0.005;
const CLS_ENTRY_DELAY_MS = 700; /* delay the entry chunk so the shells paint first */
const CLS_STEP_FRACTION = 0.6;  /* stepped sweep, 60% of a viewport per step */
const CLS_STEP_PAUSE_MS = 70;

/* Exclusion windows, section 12. Both are ONE-TIME inits and each may be
   excluded AT MOST ONCE. Anything else over 200ms is a hard failure. */
const SEQVIZ_WINDOW_MS = 1500; /* grace after the sweep begins, for the idle-callback mount */
const VIEWER3D_WINDOW_MS = 3000; /* after the structure section first comes within 1.5vh */

/* rAF deltas are clamped to the display refresh rate unless vsync is off, and
   a clamped 16.7ms median would make the section 12 budget of 12ms unreachable
   for any page at all. These flags let rAF run as fast as the main thread
   allows, so a frame delta measures real work rather than the compositor
   clock. This is recorded here because it materially shapes the numbers. */
const CHROMIUM_ARGS = [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

function pct(list, p) {
  if (list.length === 0) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/* Injected before any page script. Records frames, long tasks, console errors
   and unhandled rejections from the very first tick. */
const INSTRUMENT = () => {
  window.__qa = {
    frames: [],
    longtasks: [],
    rejections: [],
    marks: {},
  };
  let last = -1;
  const tick = (t) => {
    if (last >= 0) window.__qa.frames.push({ t, d: t - last });
    last = t;
    /* WP-15: the 3Dmol approach mark used to live in the sweep loop, which now
       runs from the harness process because the sweep is driven by real wheel
       events. It reads one rect per frame and only until it fires once. */
    if (window.__qa.watching && window.__qa.marks.structureApproach === undefined) {
      const structure = document.getElementById('structure');
      if (structure) {
        const top = structure.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY + window.innerHeight * 1.5 >= top) {
          window.__qa.marks.structureApproach = t;
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__qa.longtasks.push({ start: e.startTime, duration: e.duration, name: e.name });
      }
    });
    obs.observe({ type: 'longtask', buffered: true });
  } catch (err) {
    window.__qa.longtaskObserverError = String(err);
  }

  window.addEventListener('unhandledrejection', (e) => {
    window.__qa.rejections.push(String((e && e.reason) || 'unknown rejection'));
  });
};

/* WP-15. THE SWEEP IS DRIVEN BY REAL WHEEL EVENTS, NOT window.scrollTo.
   Measured, on this build at 1440x900 with 6x throttle: an in-page rAF loop
   calling window.scrollTo for 8 seconds moved the page 12px out of 10916px of
   scrollable document, because Lenis (spec section 6.3) owns the scroll and
   reverts a programmatic jump on the next frame. Every frame, jank and long
   task number taken that way describes a page that never scrolled. Real wheel
   events are what Lenis consumes, so the sweep is dispatched from the harness
   process through the CDP input path. The script asserts afterwards that the
   sweep actually reached the bottom, so this can never fail silently again. */
const SWEEP_TICK_MS = 40;
const SWEEP_SETTLE_MS = 1500;   /* Lenis eases after the last wheel event */
const SWEEP_MIN_COVERAGE = 0.9; /* of the scrollable distance, or the run is void */

async function wheelSweep(page, durationMs) {
  const scrollable = await page.evaluate(() => {
    window.__qa.marks.sweepStart = performance.now();
    window.__qa.watching = true;
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  });

  const ticks = Math.max(1, Math.round(durationMs / SWEEP_TICK_MS));
  /* 15% over, because Lenis eases and a wheel delta is a request, not a jump.
     Overshoot at the bottom is clamped by the document, so it costs nothing. */
  const perTick = Math.ceil((scrollable * 1.15) / ticks);
  const started = Date.now();
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, perTick);
    const elapsed = Date.now() - started;
    const due = (i + 1) * SWEEP_TICK_MS;
    if (elapsed < due) await page.waitForTimeout(due - elapsed);
    if (elapsed > durationMs) break;
  }
  await page.waitForTimeout(SWEEP_SETTLE_MS);

  const reached = await page.evaluate(() => {
    window.__qa.marks.sweepEnd = performance.now();
    return window.scrollY;
  });
  return { scrollable, reached };
}

/* WP-15. Records layout shifts from the first tick. Shifts that follow user
   input are excluded, which is what the metric itself does. */
const INSTRUMENT_CLS = () => {
  window.__cls = { value: 0, sources: [] };
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__cls.value += e.value;
        for (const src of e.sources || []) {
          const n = src.node;
          window.__cls.sources.push({
            value: e.value,
            tag: n && n.tagName ? n.tagName.toLowerCase() : '?',
            id: (n && n.id) || '',
            cls: n ? String(n.className || '').slice(0, 70) : '',
          });
        }
      }
    });
    obs.observe({ type: 'layout-shift', buffered: true });
  } catch (err) {
    window.__cls.observerError = String(err);
  }
};

/* WP-15. A stepped sweep, top to bottom and back, which is the shape WP-11
   measured as the one that exposes a shift a smooth sweep hides. */
const STEPPED_SWEEP = async ({ fraction, pauseMs }) => {
  const step = Math.max(80, Math.round(window.innerHeight * fraction));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const bottom = () => document.documentElement.scrollHeight;
  for (let y = 0; y < bottom(); y += step) {
    window.scrollTo(0, y);
    await wait(pauseMs);
  }
  window.scrollTo(0, 0);
  await wait(400);
};

/* WP-15. Wait until no long task has landed for QUIET_MS, so the sweep starts
   against a quiet page. Returns what happened, for printing. */
async function settle(page) {
  const started = Date.now();
  await page.waitForTimeout(SETTLE_MIN_MS);
  for (;;) {
    const waited = Date.now() - started;
    const sinceLast = await page.evaluate(() => {
      const tasks = (window.__qa && window.__qa.longtasks) || [];
      if (tasks.length === 0) return Number.MAX_SAFE_INTEGER;
      let end = 0;
      for (const t of tasks) end = Math.max(end, t.start + t.duration);
      return performance.now() - end;
    });
    if (sinceLast >= QUIET_MS) return { waitedMs: waited, quiet: true, sinceLast };
    if (waited >= SETTLE_MAX_MS) return { waitedMs: waited, quiet: false, sinceLast };
    await page.waitForTimeout(200);
  }
}

function firstLine(err) {
  const s = String(err && err.message ? err.message : err);
  return s.split(String.fromCharCode(10))[0];
}

async function main() {
  console.log('');
  console.log('PERF SWEEP (spec section 16.1, budgets section 12)');
  console.log('target:   ' + BASE);
  console.log('approach: injected requestAnimationFrame delta loop + PerformanceObserver longtask');
  console.log('throttle: CDP Emulation.setCPUThrottlingRate rate=' + CPU_THROTTLE);
  console.log('vsync:    off (' + CHROMIUM_ARGS.slice(0, 2).join(' ') + ') so rAF deltas measure work, not the 60Hz clock');
  console.log('');

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  /* Section 16.6 gate. */
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));

  await page.addInitScript(INSTRUMENT);

  const client = await context.newCDPSession(page);
  await client.send('Performance.enable');
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

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
    console.log('  Build the site and start the preview server before running this script.');
    console.log('');
    process.exit(2);
  }

  const hasSections = await page.evaluate(() => document.querySelectorAll('main section[id]').length);
  if (hasSections === 0) {
    await browser.close();
    console.log('  NOT READY: the page loaded but contains zero mounted sections.');
    console.log('  Wave 3 has not landed yet. There is nothing to sweep.');
    console.log('');
    process.exit(2);
  }

  /* Let the boot settle so the sweep measures scrolling, not first paint.
     WP-15: this waits for a quiet page rather than a fixed 2500ms, because at
     6x throttle the one-time seqviz mount can still be running at 2500ms and
     a sweep started on top of it measures boot, not scrolling. */
  const settled = await settle(page);
  console.log('SETTLE');
  console.log(
    '  waited ' + settled.waitedMs + 'ms before sweeping; ' +
      (settled.quiet
        ? 'no long task for the last ' + round(settled.sinceLast) + 'ms'
        : 'page never went quiet within the ' + SETTLE_MAX_MS + 'ms cap, swept anyway')
  );
  console.log('');

  const swept = await wheelSweep(page, SWEEP_MS);
  await page.waitForTimeout(500);

  console.log('SWEEP');
  console.log(
    '  driven by real wheel events; reached ' + Math.round(swept.reached) + 'px of ' +
      Math.round(swept.scrollable) + 'px scrollable (' +
      (swept.scrollable > 0 ? round((swept.reached / swept.scrollable) * 100) : 0) + '%)'
  );
  console.log('');

  /* WP-15: the boot window, reported by main.ts's reserved region. */
  const bootMeasure = await page.evaluate(() => {
    const m = performance.getEntriesByName('wp15:boot')[0];
    return m ? m.duration : null;
  });

  const data = await page.evaluate(() => ({
    frames: window.__qa.frames,
    longtasks: window.__qa.longtasks,
    rejections: window.__qa.rejections,
    marks: window.__qa.marks,
    observerError: window.__qa.longtaskObserverError || null,
  }));

  const metrics = await client.send('Performance.getMetrics');
  const scriptDuration = (metrics.metrics.find((m) => m.name === 'ScriptDuration') || { value: 0 }).value;
  const taskDuration = (metrics.metrics.find((m) => m.name === 'TaskDuration') || { value: 0 }).value;

  /* ---------------------------------------------------------------------
     CLS PASS (WP-15). A second load in its own context, with the entry chunk
     delayed so the empty shells are guaranteed to paint before any mount()
     runs, then a STEPPED sweep. Both conditions come from WP-11's measured
     finding: without the delay the harness cannot see the post-paint reflow
     class at all, and a smooth sweep read 0.0001 on a page where a stepped
     sweep read 0.0197.
     --------------------------------------------------------------------- */
  const clsContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await clsContext.addInitScript(INSTRUMENT_CLS);
  await clsContext.route('**/assets/index-*.js', async (route) => {
    await new Promise((r) => setTimeout(r, CLS_ENTRY_DELAY_MS));
    await route.continue();
  });
  const clsPage = await clsContext.newPage();
  const clsConsoleErrors = [];
  clsPage.on('console', (msg) => {
    if (msg.type() === 'error') clsConsoleErrors.push(msg.text());
  });
  clsPage.on('pageerror', (err) => clsConsoleErrors.push(String(err && err.message ? err.message : err)));
  const clsClient = await clsContext.newCDPSession(clsPage);
  await clsClient.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await clsPage.goto(BASE, { waitUntil: 'load', timeout: 45000 });
  await clsPage.waitForTimeout(4000);
  const clsAtLoad = await clsPage.evaluate(() => window.__cls.value);
  await clsPage.evaluate(STEPPED_SWEEP, { fraction: CLS_STEP_FRACTION, pauseMs: CLS_STEP_PAUSE_MS });
  const cls = await clsPage.evaluate(() => ({
    value: window.__cls.value,
    sources: window.__cls.sources.sort((a, b) => b.value - a.value).slice(0, 5),
    observerError: window.__cls.observerError || null,
  }));
  await clsContext.close();

  await browser.close();

  const failures = [];

  console.log('LAYOUT SHIFT (section 12 budget: exactly 0.00)');
  console.log('  method: entry chunk delayed ' + CLS_ENTRY_DELAY_MS + 'ms so the empty shells paint first,');
  console.log('          then a stepped sweep at ' + CLS_STEP_FRACTION + ' viewport per step, 1440x900, 6x throttle.');
  console.log('  CLS at load:             ' + clsAtLoad.toFixed(4));
  console.log('  CLS after stepped sweep: ' + cls.value.toFixed(4));
  if (cls.observerError) failures.push('layout-shift PerformanceObserver failed to attach: ' + cls.observerError);
  if (cls.sources.length === 0) {
    console.log('  no shift sources recorded.');
  } else {
    for (const src of cls.sources) {
      console.log('    ' + src.value.toFixed(4) + '  ' + src.tag + (src.id ? '#' + src.id : '') + (src.cls ? '.' + src.cls.split(' ').join('.') : ''));
    }
  }
  if (cls.value >= CLS_FAIL_AT) {
    failures.push('CLS ' + cls.value.toFixed(4) + ' does not round to the section 12 budget of 0.00');
  }
  for (const e of clsConsoleErrors) failures.push('console or page error during the CLS pass: ' + e);
  console.log('');

  if (data.observerError) {
    failures.push('longtask PerformanceObserver failed to attach: ' + data.observerError);
  }

  const sweepStart = data.marks.sweepStart ?? 0;
  const sweepEnd = data.marks.sweepEnd ?? Number.MAX_SAFE_INTEGER;

  /* Only frames produced during the sweep count against the budget. */
  const sweepFrames = data.frames.filter((f) => f.t >= sweepStart && f.t <= sweepEnd).map((f) => f.d);

  if (swept.scrollable > 0 && swept.reached < swept.scrollable * SWEEP_MIN_COVERAGE) {
    failures.push(
      'the sweep only reached ' + Math.round(swept.reached) + 'px of ' + Math.round(swept.scrollable) +
        'px, so it did not sweep the page and no frame number from this run is trustworthy'
    );
  }

  console.log('FRAMES');
  if (sweepFrames.length < 30) {
    failures.push('only ' + sweepFrames.length + ' frames captured during the sweep, which is too few to judge');
    console.log('  captured: ' + sweepFrames.length + ' (too few)');
  } else {
    const median = pct(sweepFrames, 50);
    const p95 = pct(sweepFrames, 95);
    const janked = sweepFrames.filter((d) => d > JANK_THRESHOLD_MS).length;
    const jankPct = (janked / sweepFrames.length) * 100;

    console.log('  captured:     ' + sweepFrames.length + ' frames over ' + round(sweepEnd - sweepStart) + 'ms');
    console.log('  median frame: ' + round(median) + 'ms   (budget < ' + BUDGET_MEDIAN_MS + 'ms)');
    console.log('  p95 frame:    ' + round(p95) + 'ms');
    console.log(
      '  janked (>' + JANK_THRESHOLD_MS + 'ms): ' + janked + ' of ' + sweepFrames.length + ' = ' + round(jankPct) + '%   (budget < ' + BUDGET_JANK_PCT + '%)'
    );

    if (!(median < BUDGET_MEDIAN_MS)) {
      failures.push('median frame ' + round(median) + 'ms is not under the ' + BUDGET_MEDIAN_MS + 'ms budget');
    }
    if (!(jankPct < BUDGET_JANK_PCT)) {
      failures.push('janked frames ' + round(jankPct) + '% is not under the ' + BUDGET_JANK_PCT + '% budget');
    }

    /* WP-15: when jank is missed, say where it went. Reported, never budgeted:
       the percentage above is the budget and it is not softened by this. */
    const jankFrames = data.frames.filter((f) => f.t >= sweepStart && f.t <= sweepEnd && f.d > JANK_THRESHOLD_MS);
    if (jankFrames.length > 0) {
      const inLongTask = jankFrames.filter((f) =>
        data.longtasks.some((t) => f.t >= t.start - 5 && f.t <= t.start + t.duration + 5)
      ).length;
      const worst = jankFrames.map((f) => round(f.d)).sort((a, b) => b - a).slice(0, 8);
      console.log('  of those, ' + inLongTask + ' landed inside a long task; worst frames: ' + worst.join('ms, ') + 'ms');
    }
  }

  console.log('');
  console.log('LONG TASKS');

  const sweepTasks = data.longtasks.filter((t) => t.start + t.duration >= sweepStart && t.start <= sweepEnd);
  const allTasks = data.longtasks;

  console.log('  total observed across the run: ' + allTasks.length);
  console.log('  overlapping the sweep window:  ' + sweepTasks.length);
  for (const t of allTasks) {
    console.log('    start ' + round(t.start) + 'ms   duration ' + round(t.duration) + 'ms   name ' + t.name);
  }

  /* WP-15: the section 12 budget reads "long tasks over 200ms DURING SCROLL
     SWEEP", so only tasks overlapping the sweep window are judged here. Boot
     tasks are printed under their own heading below and are budgeted by Total
     Blocking Time instead. */
  const over = sweepTasks.filter((t) => t.duration > LONGTASK_FAIL_MS);
  const bootOver = allTasks.filter((t) => t.duration > LONGTASK_FAIL_MS && !sweepTasks.includes(t));

  /* Identify the two permitted one-time exclusions by POSITION and DURATION,
     and print exactly what was excluded and why. Never silent. */
  const excluded = [];
  const remaining = [];

  const seqvizCutoff = sweepStart + SEQVIZ_WINDOW_MS;
  const approach = data.marks.structureApproach;

  let seqvizUsed = false;
  let viewer3dUsed = false;

  /* Longest first, so that if two candidates sit in one window the genuine
     one-time init is the one excluded. */
  for (const t of [...over].sort((a, b) => b.duration - a.duration)) {
    if (!seqvizUsed && t.start <= seqvizCutoff) {
      seqvizUsed = true;
      excluded.push({
        task: t,
        why:
          'one-time seqviz mount. It starts at ' +
          round(t.start) +
          'ms, which is at or before the sweep start (' +
          round(sweepStart) +
          'ms) plus the ' +
          SEQVIZ_WINDOW_MS +
          'ms idle-callback grace defined in spec section 8.6. Excluded once, by section 12.',
      });
      continue;
    }
    if (!viewer3dUsed && approach !== undefined && t.start >= approach && t.start <= approach + VIEWER3D_WINDOW_MS) {
      viewer3dUsed = true;
      excluded.push({
        task: t,
        why:
          'one-time 3Dmol init. It starts at ' +
          round(t.start) +
          'ms, inside the ' +
          VIEWER3D_WINDOW_MS +
          'ms window after the structure section first came within 1.5 viewport heights (' +
          round(approach) +
          'ms), which is when spec section 9.5 dynamically imports the viewer. Excluded once, by section 12.',
      });
      continue;
    }
    remaining.push(t);
  }

  console.log('');
  console.log('  over ' + LONGTASK_FAIL_MS + 'ms: ' + over.length);
  if (excluded.length === 0) {
    console.log('  excluded: none. No long task matched either permitted one-time init window.');
  } else {
    for (const e of excluded) {
      console.log('  EXCLUDED ' + round(e.task.duration) + 'ms task at ' + round(e.task.start) + 'ms');
      console.log('    why: ' + e.why);
    }
  }
  if (approach === undefined) {
    console.log('  note: the structure section never came within 1.5 viewport heights during the sweep,');
    console.log('        so no 3Dmol init exclusion window existed and none was applied.');
  }

  for (const t of remaining) {
    failures.push(
      'long task of ' + round(t.duration) + 'ms at ' + round(t.start) + 'ms is over the ' + LONGTASK_FAIL_MS + 'ms limit and is not a permitted one-time init'
    );
  }

  console.log('');
  console.log('BOOT LONG TASKS (before the sweep, reported not judged here)');
  if (bootOver.length === 0) {
    console.log('  none over ' + LONGTASK_FAIL_MS + 'ms.');
  } else {
    for (const t of bootOver) {
      console.log('  ' + round(t.duration) + 'ms at ' + round(t.start) + 'ms');
    }
    console.log('  These are page-load work, not scroll work. Their section 12 budget is');
    console.log('  Total Blocking Time under 300ms, which Lighthouse measures.');
  }

  console.log('');
  console.log('SCRIPT TIME');
  if (bootMeasure !== null) {
    console.log('  synchronous boot (wp15:boot, time origin to the end of mount + matchMedia): ' + round(bootMeasure) + 'ms');
  }
  console.log('  total script time (CDP ScriptDuration): ' + round(scriptDuration * 1000) + 'ms');
  console.log('  total task time  (CDP TaskDuration):    ' + round(taskDuration * 1000) + 'ms');

  console.log('');
  console.log('CONSOLE GATE (section 16.6)');
  console.log('  console errors:        ' + consoleErrors.length);
  console.log('  page errors:           ' + pageErrors.length);
  console.log('  unhandled rejections:  ' + data.rejections.length);
  for (const e of consoleErrors) console.log('    console error: ' + e);
  for (const e of pageErrors) console.log('    page error:    ' + e);
  for (const e of data.rejections) console.log('    rejection:     ' + e);

  if (consoleErrors.length > 0) failures.push(consoleErrors.length + ' console error(s), section 16.6 is a hard gate');
  if (pageErrors.length > 0) failures.push(pageErrors.length + ' uncaught page error(s), section 16.6 is a hard gate');
  if (data.rejections.length > 0) {
    failures.push(data.rejections.length + ' unhandled promise rejection(s), section 16.6 is a hard gate');
  }

  console.log('');
  if (failures.length > 0) {
    console.log('FAIL: ' + failures.length + ' budget or gate violation(s).');
    for (const f of failures) console.log('  - ' + f);
    console.log('');
    process.exit(1);
  }

  console.log('PASS: every section 12 frame budget met and the section 16.6 console gate is clean.');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.log('');
  console.log('ERROR: the perf harness itself failed.');
  console.log('  ' + String(err && err.message ? err.message : err));
  console.log('');
  process.exit(3);
});
