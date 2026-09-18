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

/* Runs in the page. Sweeps from top to bottom over durationMs using rAF, and
   records the moment the structure section first comes within 1.5 viewport
   heights, which is when section 9.5 dynamically imports the 3D viewer. */
const SWEEP = (durationMs) => {
  return new Promise((done) => {
    const doc = document.documentElement;
    const structure = document.getElementById('structure');
    window.__qa.marks.sweepStart = performance.now();
    const step = (now) => {
      const max = Math.max(0, doc.scrollHeight - window.innerHeight);
      const elapsed = now - window.__qa.marks.sweepStart;
      const p = Math.min(1, elapsed / durationMs);
      window.scrollTo(0, Math.round(max * p));
      if (structure && window.__qa.marks.structureApproach === undefined) {
        const top = structure.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY + window.innerHeight * 1.5 >= top) {
          window.__qa.marks.structureApproach = now;
        }
      }
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        window.__qa.marks.sweepEnd = performance.now();
        done(null);
      }
    };
    requestAnimationFrame(step);
  });
};

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

  /* Let the boot settle so the sweep measures scrolling, not first paint. */
  await page.waitForTimeout(2500);

  await page.evaluate(SWEEP, SWEEP_MS);
  await page.waitForTimeout(500);

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

  await browser.close();

  const failures = [];

  if (data.observerError) {
    failures.push('longtask PerformanceObserver failed to attach: ' + data.observerError);
  }

  const sweepStart = data.marks.sweepStart ?? 0;
  const sweepEnd = data.marks.sweepEnd ?? Number.MAX_SAFE_INTEGER;

  /* Only frames produced during the sweep count against the budget. */
  const sweepFrames = data.frames.filter((f) => f.t >= sweepStart && f.t <= sweepEnd).map((f) => f.d);

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

  const over = allTasks.filter((t) => t.duration > LONGTASK_FAIL_MS);

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
  console.log('SCRIPT TIME');
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
