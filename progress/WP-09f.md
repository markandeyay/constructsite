# WP-09f: Section 06, From sequence to structure

Claimed 2026-09-18T01:45:50Z. Owns `src/sections/structure.ts` and the single
`WP-09f` delimited block at the end of `src/styles/sections.css`. Nothing else.

Summary line 1: spec section 7.6 is built as a full bleed `--paper-sunk`
section, minimum 80vh, with the contract C5 section head, WP-07's viewer
element, an overlaid left aligned caption block, and the PDB attribution line
as a sibling of the viewer.
Summary line 2: `initScrub` creates the one ScrollTrigger this section owns and
is called by nobody here; it maps scroll progress to `handle.setZoom(p)` and is
never created, or is killed, when `mountViewer3d` answers `null`.

---

## 1. What was built

`mount(root)`

```
section#structure.sec-structure
  div.container
    header.sec-head           num 06 (aria-hidden), kicker, h2#structure-title, hr
    div.sec-structure__stage
      div.sec-structure__viewer      <- passed to mountViewer3d, WP-07 owns its interior
      div.sec-structure__caption     <- overlaid, left aligned: copy.structure.body
                                        and copy.structure.caption
      p.sec-structure__credit.mono   <- copy.structure.pdbcredit, SIBLING of the viewer
```

- Every user facing string comes from `content/copy.ts`. This module writes
  none of its own.
- The viewer element never carries `.reveal`, so it is visible in every mode
  and its reserved box is never animated.
- `revealWords(title, { staggerMs: 40 })` on the `h2` only. Per WP-08's note,
  the caption and the credit are deliberately NOT split: the caption is
  governed by override A6 Q12 and has to stay one intact string in the built
  page so the claim stays verifiable. Nothing in this module or its CSS block
  writes an opacity on the title.

`initScrub()`

- Called ONLY from the single `gsap.matchMedia()` block in `main.ts` (WP-10),
  in document order. Nothing in this file calls it. It is the only place in the
  section that creates a ScrollTrigger (spec section 6.4).
- `trigger: #structure`, `start: 'top 85%'`, `end: 'bottom 15%'`, `scrub: 1`,
  `invalidateOnRefresh: true`, and `onUpdate` maps `self.progress` to
  `handle.setZoom(p)`: wide establishing shot to closer view, per spec 7.6. The
  wide-to-close mapping itself lives in WP-07 (`0.78` to `1.55` of the
  `zoomTo()` fit), so there is one owner of the camera.
- Returns a cleanup that kills the trigger, which matchMedia runs when the
  query stops matching.

## 2. The null handle

`mountViewer3d` settles immediately and resolves `null` when it rendered the
static still (below 720px, or no WebGL). Two orderings had to work, because the
handle arrives on a microtask that can land either side of WP-10's matchMedia
block:

- `null` arrives BEFORE `initScrub`: `isStill` is set, `initScrub` returns
  without creating anything. Zero ScrollTriggers, no scrub, no `setZoom` on
  nothing.
- `null` arrives AFTER `initScrub`: the already-created trigger is killed the
  moment the answer lands.

For the same reason neither function captures the handle by value: both read
the module binding live. A progress value produced before the handle exists is
stored and applied the moment it arrives, which closes the gap on the near side
of WP-07's own buffering of `setZoom` calls made before 3Dmol finishes loading.

Verified in both directions in section 5 below.

## 3. CSS, the one block

Appended at the end of `sections.css`, opened `/* ==== WP-09f: Structure ==== */`
and closed `/* ==== /WP-09f ==== */`. Every selector prefixed `.sec-structure`.
Maximum specificity used is (0,2,0), no `!important`, breakpoints only 900 and
600 as literal px. No other block was touched, and in particular the `.fx-viewer3d`
block above it is untouched.

- `.sec-structure`: `--paper-sunk`, `min-height: 80vh`.
- `.sec-structure__stage`: `max-width: 900px`, centred, `position: relative`.
  A 4/3 box across the full 1200px container is 900px tall, which overruns a
  laptop viewport, so the stage is capped and the viewer keeps its own box.
- `.sec-structure__caption`: absolutely positioned over the viewer, left
  aligned, `width: min(24em, 44%)`, on an OPAQUE `--paper-sunk` panel with a
  1px `--rule` border. Opaque on purpose: it is a panel, not the frosted
  translucency spec section 2.4 bans, and it keeps the text on a surface whose
  contrast is the measured one rather than on whatever ribbon is behind it.
  `pointer-events: none`, so drag to rotate still reaches the canvas.
- Below 900px the caption leaves the overlay and drops into normal flow under
  the viewer. Below 720px WP-07 has already swapped in the still.
- Reduced motion: `.no-motion` rules plus a `prefers-reduced-motion` media
  query pin the caption and the credit to `opacity: 1`, on top of base.css
  cancelling `.reveal` and `core/observe.ts` settling synchronously. Three
  independent layers, so no element here can sit at `opacity: 0`.

No gradient, no glow, no glassmorphism, no imagery, no emoji, no particle
field. The structure's colouring is WP-07's muted secondary-structure palette
and nothing here overrides it.

## 4. Layout stability

`.fx-viewer3d` reserves `aspect-ratio: 4 / 3` with an explicit width and height
on the still (WP-07). The block here sets only `display: block; width: 100%` on
that element and caps the stage width. Measured on the built page: the computed
`aspect-ratio` of the viewer element is `4 / 3` after full load, so the reserved
box survives the wrapper. The overlay is absolutely positioned and therefore
cannot reflow anything when it reveals. The credit line is in normal flow and
is present from mount, not injected later.

## 5. Measured verification

Real `npm run build`, then two `vite preview` servers (the site, and a throwaway
harness build), driven with the installed `playwright` package in Chromium. The
harness existed only to call `initScrub` inside a `gsap.matchMedia()` block,
because WP-10 has not wired it yet; the harness page, its entry, its throwaway
vite config, its output directory and the verification script were all deleted
after the run. Only the two PIDs this package started were stopped.

```
PASS  1440: viewer element carries .fx-viewer3d
PASS  1440: WebGL viewer mounted (canvas present, no still)
PASS  1440: stage has role=img
PASS  1440: reserved aspect box 4/3 intact
PASS  1440: caption rendered verbatim
PASS  1440: credit rendered verbatim
PASS  1440: credit is a sibling of the viewer element
PASS  1440: caption is not inside the viewer element
PASS  1440: credit is mono and small  12px
PASS  1440: section background is --paper-sunk
PASS  1440: min-height is 80vh  720px
PASS  1440: h2 id is structure-title
PASS  1440: numeral 06 is aria-hidden
PASS  1440: caption overlay does not block drag
PASS  1440: 3Dmol chunk requested  1 request(s)
PASS  1440: gfp.pdb fetched
PASS  1440: zero console errors  []
PASS  1440: zero page errors and unhandled rejections  []
PASS  TRUTH gate: no wording linking the structure to the hero construct
PASS  375: static still rendered
PASS  375: no WebGL canvas
PASS  375: caption stacked, not overlaid
PASS  375: 3dmol never requested  []
PASS  375: gfp.pdb never requested
PASS  375: zero console errors  []
PASS  375: zero unhandled rejections  []
PASS  reduced motion @1440: no element in the section at opacity 0  []
PASS  reduced motion @1440: zero console errors  []
PASS  reduced motion @375: no element in the section at opacity 0  []
PASS  reduced motion @375: zero console errors  []
PASS  scrub: exactly one ScrollTrigger exists after initScrub  count=1
PASS  scrub: the rendered view changes between the wide and the close end
PASS  scrub harness: zero console errors  []
PASS  scrub harness: zero unhandled rejections  []
PASS  no handle (700px, still showing): zero ScrollTriggers  count=0 still=true

ALL CHECKS PASSED
```

Notes on two of those lines:

- The 1440 desktop run observes the 3Dmol chunk being requested POSITIVELY on
  approach (one request) and a live `canvas` inside the viewer, so the mobile
  run's zero requests is a real absence and not a dead server.
- The scrub check is a rendered-pixel comparison: the viewer element is
  screenshotted at the wide end of the range and again at the close end, and
  the two images differ. It is not an inspection of internal state.

Rendered measurements from the same run: viewer computed `aspect-ratio`
`4 / 3`, section background `rgb(242, 240, 236)` (`--paper-sunk`), section
`min-height` 720px at a 900px tall viewport (80vh), credit font
`"JetBrains Mono", ui-monospace, ...` at 12px (`--t-micro`), caption
`pointer-events: none`, mobile still `naturalWidth` 1200 with real alt text.

## 6. Gates

- `npx tsc --noEmit`: clean.
- `npm run build`: clean. 3Dmol remains a separate chunk
  (`assets/3Dmol-*.js`, 587.80 kB raw, 169.76 kB gzipped), outside the entry,
  as spec section 12 requires.
- Zero console errors and zero unhandled rejections in every run above. The two
  `_TODO` placeholder warnings from WP-06 and WP-09e are `console.warn`, are
  expected, and are not errors.

## 7. Override A6 Q12, the truth gate

`copy.structure.caption` ships as WP-04 wrote it:

> Green fluorescent protein (PDB 1EMA), a reporter protein used throughout
> molecular biology.

It is rendered verbatim, as one intact string, and describes the structure on
its own terms. No linking sentence, connecting phrase or wording of this
module's own reasserts any correspondence with the demo construct in the hero,
which is a placeholder payload. The built page was asserted against a pattern
covering "shown above", "shown in the hero", "the construct above", "this
construct", "demo construct", "pCON" and "matches the", across the caption, the
body and the credit. Zero hits.

Spec section 19's Definition of Done carries a checkbox reading "the section
11.6 structure caption matches the construct actually shown in the hero (see
section 20 Q12)". That checkbox is satisfied by the Q12 override branch: the
linking clause is cut, so there is no correspondence claim left to match. WP-17
should read it that way rather than expecting a linking clause to be present.

## 8. Blockers

None.
