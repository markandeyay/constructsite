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
 * Exit:   0 pass. 1 a real violation. 2 not ready (server down, page empty, or
 *         the machine is too loaded for the frame numbers to mean anything).
 *         3 the harness itself threw.
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
 *
 * WP-16-fix repaired two defects that three packages disagreed over. Neither
 * touches a section 12 budget or threshold.
 *
 *   A. THE ONE-TIME-INIT EXCLUSION WAS TOO COARSE, AND FAILED THE BUILD FOR THE
 *      WRONG REASON. Section 12 permits excluding "the one-time seqviz mount and
 *      the one-time 3Dmol init". The previous rule excluded AT MOST ONE TASK per
 *      init, identified by a time window alone. WP-17 measured the 3Dmol init
 *      arriving as TWO tasks (690ms at 9993ms and 1731ms at 10793ms, both inside
 *      the init window), and WP-07-fix confirmed by sourcemapped profile that
 *      those two tasks are the two halves of one initialisation: chunk
 *      evaluation plus PDB parse, then first render plus first geometry build.
 *      Nothing from auto-rotation or the zoom scrub remained. So the gate failed
 *      on init work that section 12 explicitly permits.
 *
 *      The new rule is an INIT BURST, and it is deliberately harder to satisfy
 *      than a time window, not easier:
 *        - The window is anchored to OBSERVED INITIALISATION EVIDENCE, not to a
 *          guess about when scrolling reached a section. It opens at the
 *          responseEnd of that subsystem's own chunk (the 3Dmol chunk, the
 *          seqviz chunk) and closes INIT_TAIL_MS after that subsystem's DOM
 *          first exists (the viewer canvas inside #structure, the map svg inside
 *          #hero). Both pieces of evidence must be present or nothing at all is
 *          excluded for that init, and the script says which one was missing.
 *        - Inside the window only a CONTIGUOUS RUN of long tasks is attributable:
 *          the first one, then each next one only if it begins within
 *          INIT_BURST_GAP_MS of the end of the previous one. A task that starts
 *          after an idle gap is not part of the same initialisation and is
 *          counted against the budget even though it sits inside the window.
 *          This is what stops a scroll-work regression hiding inside the window.
 *        - The burst is CAPPED at INIT_MAX_TASKS tasks and INIT_MAX_TOTAL_MS of
 *          attributed time. Exceeding either cap excludes NOTHING and raises its
 *          own named failure, because an initialisation that large is no longer
 *          plausibly an initialisation.
 *        - Every excluded task is still printed with its duration, its start and
 *          the full reason, exactly as before. Nothing is ever excluded silently
 *          and nothing is excluded by time window alone.
 *
 *   B. THE JANK NUMBER HAD NO FLOOR, AND THREE PACKAGES READ IT THREE WAYS.
 *      WP-15 measured a blank control at 17.1ms median and 0.00% janked and
 *      called the budget met by the harness. WP-07-fix measured a blank control
 *      at 22 to 31ms median and 50 to 56% janked and called the budget
 *      unmeasurable. WP-17 found the cause: a blank page that paints nothing has
 *      its rAF THROTTLED, so a blank page is not a floor at all. It lands just
 *      under or just over the 20ms threshold by luck, and the whole verdict
 *      flips. Given one trivial transform per frame, the same machine delivers
 *      1.3 to 1.4ms median and 0.05 to 0.07% janked over roughly 6000 frames.
 *
 *      So the control is now BUILT IN and runs INTERLEAVED with the real
 *      measurement on every invocation: one control sweep before the site and
 *      one after, same browser, same flags, same 6x throttle, same wheel-driven
 *      sweep, same duration. Its median and jank print beside the site's. A
 *      frame number without its control is not interpretable, and this build
 *      proved that three times.
 *
 *      If the control itself reads badly (CONTROL_MAX_MEDIAN_MS /
 *      CONTROL_MAX_JANK_PCT / too few frames / did not reach the bottom) the
 *      machine cannot resolve the difference between the budget and the floor.
 *      The script then WITHHOLDS the frame verdict and exits 2, saying the
 *      machine is too loaded to judge. It still prints everything it measured,
 *      labelled as observed and not adjudicated. It does not emit a pass.
 */

import { chromium } from 'playwright';

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '') + '/';

/* Section 12 budgets. Untouched by WP-16-fix. */
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

/* ---------------------------------------------------------------------------
   WP-16-fix, defect A. The bounds on a one-time init exclusion.

   These are bounds on what the HARNESS may attribute to an init. They are not
   section 12 budgets and they do not change one. Every one of them makes the
   exclusion narrower than the time window it replaces.
   --------------------------------------------------------------------------- */
const INIT_LEAD_MS = 100;       /* a task may begin this long before the chunk's responseEnd */
const INIT_TAIL_MS = 1500;      /* the window closes this long after the init's DOM first exists */
const INIT_BURST_GAP_MS = 600;  /* an idle gap longer than this ends the burst */
const INIT_MAX_TASKS = 3;       /* at most this many tasks are one initialisation */
const INIT_MAX_TOTAL_MS = 4000; /* and at most this much time in total */
/* INIT_MAX_TOTAL_MS is set from measurement, not taste. The genuine 3Dmol init
   on this build at 1440x900 and 6x throttle arrives as TWO tasks totalling 2275,
   2433, 2512 and 3175ms across four runs, the last of them on a loaded machine.
   4000ms sits above the largest of those and is still a hard ceiling: it was
   proved to trip, and to exclude nothing, when a deliberately injected 2000ms
   task was made contiguous with the init. The task-count cap is the tighter of
   the two bounds in practice, since the real init is two tasks. */

/* ---------------------------------------------------------------------------
   WP-16-fix, defect B. The interleaved control.

   One trivial transform per frame on an otherwise empty scrolling page. Not a
   blank page: a blank page has its rAF throttled and is not a floor. The
   measured floor on the reference machine was 1.3 to 1.4ms median and 0.05 to
   0.07% janked. These gates sit well above that and well below the section 12
   budget, so the run is judged only when the machine can actually resolve the
   difference between the two.
   --------------------------------------------------------------------------- */
const CONTROL_HEIGHT_PX = 11000;  /* roughly this site's scrollable document */
const CONTROL_MAX_MEDIAN_MS = 4;  /* floor is ~1.3ms; budget is 12ms */
const CONTROL_MAX_JANK_PCT = 1;   /* floor is ~0.05%; budget is 2% */
const CONTROL_MIN_FRAMES = 500;
const CONTROL_PATH = '__qa_control__';

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
   and unhandled rejections from the very first tick.

   WP-16-fix adds two kinds of INITIALISATION EVIDENCE, because the exclusion
   rule below is no longer allowed to rest on a time window alone:
     - resource timing for the seqviz and 3Dmol chunks, which says when the code
       for that subsystem actually arrived and could first be evaluated;
     - the moment that subsystem's own DOM first exists, watched with one
       MutationObserver on childList that disconnects as soon as both marks are
       recorded. childList records are rare on this page during a sweep (GSAP and
       the reveal helper change attributes, not children), so this costs the
       frame numbers nothing measurable. */
const INSTRUMENT = () => {
  window.__qa = {
    frames: [],
    longtasks: [],
    rejections: [],
    resources: [],
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

  /* WP-16-fix: when each subsystem's own chunk finished arriving. */
  try {
    const robs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (/3dmol|seqviz|index\.browser/i.test(e.name)) {
          window.__qa.resources.push({ name: e.name, start: e.startTime, end: e.responseEnd });
        }
      }
    });
    robs.observe({ type: 'resource', buffered: true });
  } catch (err) {
    window.__qa.resourceObserverError = String(err);
  }

  /* WP-16-fix: when each subsystem's own DOM first exists. */
  try {
    const scan = (root, now) => {
      if (!root || root.nodeType !== 1) return;
      const nodes = [root];
      if (root.querySelectorAll) {
        for (const n of root.querySelectorAll('canvas, svg')) nodes.push(n);
      }
      for (const n of nodes) {
        const tag = String(n.tagName || '').toLowerCase();
        if (!n.closest) continue;
        if (tag === 'canvas' && window.__qa.marks.viewer3dCanvas === undefined && n.closest('#structure')) {
          window.__qa.marks.viewer3dCanvas = now;
        }
        if (tag === 'svg' && window.__qa.marks.plasmidSvg === undefined && n.closest('#hero')) {
          window.__qa.marks.plasmidSvg = now;
        }
      }
    };
    const done = () =>
      window.__qa.marks.viewer3dCanvas !== undefined && window.__qa.marks.plasmidSvg !== undefined;
    const mo = new MutationObserver((records) => {
      const now = performance.now();
      for (const r of records) {
        for (const n of r.addedNodes) scan(n, now);
      }
      if (done()) mo.disconnect();
    });
    mo.observe(document, { childList: true, subtree: true });
    if (document.documentElement) scan(document.documentElement, performance.now());
  } catch (err) {
    window.__qa.domObserverError = String(err);
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

/* ---------------------------------------------------------------------------
   WP-16-fix, defect B. The control page.

   A tall, otherwise empty scrolling document that performs exactly ONE
   transform write per animation frame. That single write is the whole point:
   it keeps the compositor and the rAF clock honest. A page that paints nothing
   has its rAF throttled by the browser and reads anywhere from 17ms to 31ms
   median depending on nothing the site controls, which is how three packages
   got three verdicts from the same budget.
   --------------------------------------------------------------------------- */
const CONTROL_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>perf control</title>
<style>
  html,body{margin:0;padding:0;background:#FAF9F7}
  #spacer{height:${CONTROL_HEIGHT_PX}px}
  #mark{position:fixed;top:40px;left:40px;width:96px;height:96px;background:#1F6B4A}
</style></head>
<body><div id="spacer"></div><div id="mark"></div>
<script>
(function(){
  var el = document.getElementById('mark');
  var i = 0;
  function frame(){
    i = (i + 1) % 360;
    el.style.transform = 'rotate(' + i + 'deg)';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script></body></html>`;

async function runControl(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(INSTRUMENT);
  const url = BASE + CONTROL_PATH;
  await context.route(url, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: CONTROL_HTML })
  );
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(800);

  const swept = await wheelSweep(page, SWEEP_MS);
  await page.waitForTimeout(300);
  const data = await page.evaluate(() => ({
    frames: window.__qa.frames,
    longtasks: window.__qa.longtasks,
    marks: window.__qa.marks,
  }));
  await context.close();

  const start = data.marks.sweepStart ?? 0;
  const end = data.marks.sweepEnd ?? Number.MAX_SAFE_INTEGER;
  const deltas = data.frames.filter((f) => f.t >= start && f.t <= end).map((f) => f.d);
  const janked = deltas.filter((d) => d > JANK_THRESHOLD_MS).length;
  const coverage = swept.scrollable > 0 ? swept.reached / swept.scrollable : 0;
  return {
    label,
    frames: deltas.length,
    median: deltas.length ? pct(deltas, 50) : Number.NaN,
    p95: deltas.length ? pct(deltas, 95) : Number.NaN,
    jankPct: deltas.length ? (janked / deltas.length) * 100 : Number.NaN,
    longtasks: data.longtasks.length,
    coverage,
  };
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

/* ---------------------------------------------------------------------------
   WP-16-fix, defect A. Build one init's exclusion window from observed evidence,
   then attribute at most one bounded, contiguous burst of long tasks to it.

   Returns a record that is printed in full whatever the outcome. There are
   exactly four outcomes and each one is named in the output:
     - no-evidence   the chunk never arrived, or the DOM never appeared. Nothing
                     is excluded and the missing piece is named.
     - no-candidate  the window existed and no long task over 200ms started in it.
     - excluded      a contiguous burst inside the caps, printed task by task.
     - overrun       a burst that breaks a cap. Nothing is excluded, and this is
                     its own failure: an init that large is not an init.
   --------------------------------------------------------------------------- */
function attributeInit(init, candidates, alreadyExcluded) {
  if (!init.chunk) {
    return { init, outcome: 'no-evidence', reason: 'the ' + init.chunkWhat + ' was never fetched in this run, so there is no initialisation to attribute anything to' };
  }
  if (init.domMark === undefined) {
    return { init, outcome: 'no-evidence', reason: init.domWhat + ' never appeared in this run, so the initialisation never completed and nothing may be attributed to it' };
  }

  const windowStart = init.chunk.end - INIT_LEAD_MS;
  const windowEnd = init.domMark + INIT_TAIL_MS;
  const win = { start: windowStart, end: windowEnd };

  const pool = candidates
    .filter((t) => !alreadyExcluded.has(t) && t.start >= windowStart && t.start <= windowEnd)
    .sort((a, b) => a.start - b.start);

  if (pool.length === 0) {
    return { init, win, outcome: 'no-candidate' };
  }

  const burst = [pool[0]];
  let cursor = pool[0].start + pool[0].duration;
  for (let i = 1; i < pool.length; i += 1) {
    const gap = pool[i].start - cursor;
    if (gap > INIT_BURST_GAP_MS) break;
    burst.push(pool[i]);
    cursor = pool[i].start + pool[i].duration;
  }

  const total = burst.reduce((s, t) => s + t.duration, 0);
  if (burst.length > INIT_MAX_TASKS || total > INIT_MAX_TOTAL_MS) {
    return { init, win, outcome: 'overrun', burst, total };
  }
  return { init, win, outcome: 'excluded', burst, total };
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
  console.log('control:  one transform per frame, swept identically, before and after the site.');
  console.log('          A blank page is NOT a floor: with nothing to paint its rAF is throttled.');
  console.log('');

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });

  /* Cheap reachability probe before spending two control sweeps on a dead port. */
  const probeContext = await browser.newContext();
  const probePage = await probeContext.newPage();
  let probe;
  try {
    probe = await probePage.goto(BASE, { waitUntil: 'commit', timeout: 20000 });
  } catch (err) {
    await browser.close();
    console.log('  NOT READY: could not load ' + BASE);
    console.log('  Reason: ' + firstLine(err));
    console.log('  Start the preview server first:  npm run build && npm run preview');
    console.log('');
    process.exit(2);
  }
  if (!probe || !probe.ok()) {
    await browser.close();
    console.log('  NOT READY: ' + BASE + ' returned ' + (probe ? probe.status() : 'no response') + '.');
    console.log('  Build the site and start the preview server before running this script.');
    console.log('');
    process.exit(2);
  }
  await probeContext.close();

  /* WP-16-fix: control sweep one, BEFORE the site. */
  const controlBefore = await runControl(browser, 'before');

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
    resources: window.__qa.resources,
    marks: window.__qa.marks,
    observerError: window.__qa.longtaskObserverError || null,
    resourceObserverError: window.__qa.resourceObserverError || null,
    domObserverError: window.__qa.domObserverError || null,
  }));

  const metrics = await client.send('Performance.getMetrics');
  const scriptDuration = (metrics.metrics.find((m) => m.name === 'ScriptDuration') || { value: 0 }).value;
  const taskDuration = (metrics.metrics.find((m) => m.name === 'TaskDuration') || { value: 0 }).value;

  await context.close();

  /* WP-16-fix: control sweep two, AFTER the site, same browser and flags. */
  const controlAfter = await runControl(browser, 'after');

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
  if (data.resourceObserverError) {
    failures.push('resource PerformanceObserver failed to attach, so no init exclusion can be evidenced: ' + data.resourceObserverError);
  }
  if (data.domObserverError) {
    failures.push('init DOM MutationObserver failed to attach, so no init exclusion can be evidenced: ' + data.domObserverError);
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

  /* ---------------------------------------------------------------------
     WP-16-fix, defect B. The control, printed beside the site.
     --------------------------------------------------------------------- */
  const controls = [controlBefore, controlAfter];
  console.log('CONTROL (one transform per frame, same browser, same flags, same ' + CPU_THROTTLE + 'x throttle, same wheel sweep)');
  for (const c of controls) {
    console.log(
      '  ' + c.label.padEnd(7) +
        ' frames ' + String(c.frames).padStart(5) +
        '   median ' + String(round(c.median)).padStart(6) + 'ms' +
        '   p95 ' + String(round(c.p95)).padStart(6) + 'ms' +
        '   janked ' + String(round(c.jankPct)).padStart(6) + '%' +
        '   long tasks ' + c.longtasks +
        '   coverage ' + round(c.coverage * 100) + '%'
    );
  }

  const controlMedian = Math.max(...controls.map((c) => (Number.isFinite(c.median) ? c.median : Infinity)));
  const controlJank = Math.max(...controls.map((c) => (Number.isFinite(c.jankPct) ? c.jankPct : Infinity)));
  const controlFrames = Math.min(...controls.map((c) => c.frames));
  const controlCoverage = Math.min(...controls.map((c) => c.coverage));

  const controlProblems = [];
  if (!(controlMedian <= CONTROL_MAX_MEDIAN_MS)) {
    controlProblems.push('control median frame ' + round(controlMedian) + 'ms is above the ' + CONTROL_MAX_MEDIAN_MS + 'ms gate');
  }
  if (!(controlJank <= CONTROL_MAX_JANK_PCT)) {
    controlProblems.push('control janked frames ' + round(controlJank) + '% is above the ' + CONTROL_MAX_JANK_PCT + '% gate');
  }
  if (!(controlFrames >= CONTROL_MIN_FRAMES)) {
    controlProblems.push('control produced only ' + controlFrames + ' frames, below the ' + CONTROL_MIN_FRAMES + ' minimum');
  }
  if (!(controlCoverage >= SWEEP_MIN_COVERAGE)) {
    controlProblems.push('control sweep reached only ' + round(controlCoverage * 100) + '% of its scrollable distance');
  }
  if (controlProblems.length === 0) {
    console.log('  floor is sound: the machine can resolve the difference between the ' + BUDGET_JANK_PCT + '% budget and the floor.');
  } else {
    console.log('  FLOOR IS NOT SOUND:');
    for (const p of controlProblems) console.log('    - ' + p);
  }
  console.log('');

  console.log('FRAMES');
  let siteMedian = Number.NaN;
  let siteJankPct = Number.NaN;
  const frameFailures = [];
  if (sweepFrames.length < 30) {
    frameFailures.push('only ' + sweepFrames.length + ' frames captured during the sweep, which is too few to judge');
    console.log('  captured: ' + sweepFrames.length + ' (too few)');
  } else {
    siteMedian = pct(sweepFrames, 50);
    const p95 = pct(sweepFrames, 95);
    const janked = sweepFrames.filter((d) => d > JANK_THRESHOLD_MS).length;
    siteJankPct = (janked / sweepFrames.length) * 100;

    console.log('  captured:     ' + sweepFrames.length + ' frames over ' + round(sweepEnd - sweepStart) + 'ms   (control: ' + controlBefore.frames + ' / ' + controlAfter.frames + ')');
    console.log('  median frame: ' + round(siteMedian) + 'ms   (budget < ' + BUDGET_MEDIAN_MS + 'ms, control floor ' + round(controlBefore.median) + ' / ' + round(controlAfter.median) + 'ms)');
    console.log('  p95 frame:    ' + round(p95) + 'ms   (control ' + round(controlBefore.p95) + ' / ' + round(controlAfter.p95) + 'ms)');
    console.log(
      '  janked (>' + JANK_THRESHOLD_MS + 'ms): ' + janked + ' of ' + sweepFrames.length + ' = ' + round(siteJankPct) + '%   (budget < ' + BUDGET_JANK_PCT + '%, control floor ' + round(controlBefore.jankPct) + ' / ' + round(controlAfter.jankPct) + '%)'
    );

    if (!(siteMedian < BUDGET_MEDIAN_MS)) {
      frameFailures.push('median frame ' + round(siteMedian) + 'ms is not under the ' + BUDGET_MEDIAN_MS + 'ms budget (control floor this run: ' + round(controlMedian) + 'ms)');
    }
    if (!(siteJankPct < BUDGET_JANK_PCT)) {
      frameFailures.push(
        'janked frames ' + round(siteJankPct) + '% is not under the ' + BUDGET_JANK_PCT + '% budget. The control floor measured in the same run, on the same machine, with the same flags and throttle, is ' + round(controlJank) + '%, so this is the page and not the harness'
      );
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

  /* ---------------------------------------------------------------------
     WP-16-fix, defect A. The two permitted one-time inits, each attributed at
     most ONE bounded, contiguous, evidenced burst of long tasks.
     --------------------------------------------------------------------- */
  const resources = data.resources || [];
  const newest = (re) => {
    const hits = resources.filter((r) => re.test(r.name)).sort((a, b) => a.end - b.end);
    return hits.length ? hits[0] : null;
  };

  const inits = [
    {
      key: 'seqviz',
      label: 'the one-time seqviz mount (spec sections 8.6 and 12)',
      chunk: newest(/seqviz|index\.browser/i),
      chunkWhat: 'seqviz chunk',
      domMark: data.marks.plasmidSvg,
      domWhat: 'the first svg element inside #hero, which is the rendered map',
    },
    {
      key: 'viewer3d',
      label: 'the one-time 3Dmol init (spec sections 9.5 and 12)',
      chunk: newest(/3dmol/i),
      chunkWhat: '3Dmol chunk',
      domMark: data.marks.viewer3dCanvas,
      domWhat: 'the first canvas element inside #structure, which is the viewer surface',
    },
  ];

  const excludedSet = new Set();
  const results = [];
  for (const init of inits) {
    const r = attributeInit(init, over, excludedSet);
    if (r.outcome === 'excluded') for (const t of r.burst) excludedSet.add(t);
    results.push(r);
  }
  const remaining = over.filter((t) => !excludedSet.has(t));

  console.log('');
  console.log('  over ' + LONGTASK_FAIL_MS + 'ms inside the sweep: ' + over.length);
  console.log('  exclusion rule: a contiguous burst of at most ' + INIT_MAX_TASKS + ' tasks totalling at most ' +
    INIT_MAX_TOTAL_MS + 'ms, no gap over ' + INIT_BURST_GAP_MS + 'ms between them, inside a window that opens ' +
    INIT_LEAD_MS + 'ms before that subsystem\'s own chunk finished downloading and closes ' + INIT_TAIL_MS +
    'ms after that subsystem\'s own DOM first existed. Both pieces of evidence are required.');

  for (const r of results) {
    console.log('');
    console.log('  ' + r.init.label);
    if (r.outcome === 'no-evidence') {
      console.log('    NOTHING EXCLUDED. ' + r.reason + '.');
      continue;
    }
    console.log(
      '    evidence: ' + r.init.chunkWhat + ' responseEnd ' + round(r.init.chunk.end) + 'ms; ' +
        r.init.domWhat + ' first seen ' + round(r.init.domMark) + 'ms.'
    );
    console.log('    window:   ' + round(r.win.start) + 'ms to ' + round(r.win.end) + 'ms.');
    if (r.outcome === 'no-candidate') {
      console.log('    NOTHING EXCLUDED. No long task over ' + LONGTASK_FAIL_MS + 'ms started inside that window during the sweep.');
      continue;
    }
    if (r.outcome === 'overrun') {
      console.log(
        '    NOTHING EXCLUDED, AND THIS IS A FAILURE. The burst is ' + r.burst.length + ' task(s) totalling ' +
          round(r.total) + 'ms, which breaks the cap of ' + INIT_MAX_TASKS + ' tasks and ' + INIT_MAX_TOTAL_MS + 'ms.'
      );
      for (const t of r.burst) {
        console.log('      ' + round(t.duration) + 'ms at ' + round(t.start) + 'ms   NOT excluded');
      }
      failures.push(
        r.init.label + ' window contains a burst of ' + r.burst.length + ' long task(s) totalling ' + round(r.total) +
          'ms, which exceeds what a one-time init can plausibly be (cap ' + INIT_MAX_TASKS + ' tasks / ' +
          INIT_MAX_TOTAL_MS + 'ms). Nothing was excluded and every one of those tasks is counted against the budget'
      );
      continue;
    }
    console.log('    EXCLUDED ' + r.burst.length + ' task(s), ' + round(r.total) + 'ms in total:');
    let idx = 0;
    for (const t of r.burst) {
      idx += 1;
      const gapNote = idx === 1
        ? 'first task of the burst, starting ' + round(t.start - r.init.chunk.end) + 'ms after the chunk arrived'
        : 'continues the same burst, starting ' + round(t.start - (r.burst[idx - 2].start + r.burst[idx - 2].duration)) + 'ms after the previous task ended, inside the ' + INIT_BURST_GAP_MS + 'ms gap limit';
      console.log('      EXCLUDED ' + round(t.duration) + 'ms task at ' + round(t.start) + 'ms');
      console.log('        why: ' + gapNote + '. It is part of ' + r.init.label + ', which section 12 permits excluding once. Window ' +
        round(r.win.start) + 'ms to ' + round(r.win.end) + 'ms, anchored on the ' + r.init.chunkWhat + ' arriving at ' +
        round(r.init.chunk.end) + 'ms and ' + r.init.domWhat + ' first existing at ' + round(r.init.domMark) + 'ms. Burst total so far ' +
        round(r.burst.slice(0, idx).reduce((s, x) => s + x.duration, 0)) + 'ms of the ' + INIT_MAX_TOTAL_MS + 'ms cap.');
    }
  }

  if (data.marks.structureApproach !== undefined) {
    console.log('');
    console.log('  for context: the structure section first came within 1.5 viewport heights at ' +
      round(data.marks.structureApproach) + 'ms. That mark is printed, not used as an exclusion window:');
    console.log('  a time window alone would let a genuine scroll-work regression hide inside it.');
  }

  for (const t of remaining) {
    failures.push(
      'long task of ' + round(t.duration) + 'ms at ' + round(t.start) + 'ms is over the ' + LONGTASK_FAIL_MS + 'ms limit and is not part of a permitted one-time init burst'
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

  /* ---------------------------------------------------------------------
     WP-16-fix, defect B. A frame verdict is only emitted when the control says
     the machine can carry one.
     --------------------------------------------------------------------- */
  console.log('');
  if (controlProblems.length > 0) {
    console.log('NO VERDICT: the machine is too loaded to judge the frame budgets.');
    for (const p of controlProblems) console.log('  - ' + p);
    console.log('  A control page doing one trivial transform per frame reads roughly 1.3ms median and');
    console.log('  0.05% janked on an idle machine. It did not read that here, so the ' + BUDGET_MEDIAN_MS + 'ms and ' +
      BUDGET_JANK_PCT + '% budgets');
    console.log('  cannot be resolved from the floor in this run. Close other work and run it again.');
    const observed = failures.concat(frameFailures);
    if (observed.length > 0) {
      console.log('');
      console.log('  Observed in this run, NOT adjudicated, because the run is not a verdict:');
      for (const f of observed) console.log('    - ' + f);
    }
    console.log('');
    process.exit(2);
  }

  for (const f of frameFailures) failures.push(f);

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
