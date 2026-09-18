# WP-09a: Section 01, Hero

Claimed 2026-09-18T01:43:46Z.

Owns: `src/sections/hero.ts` and the one delimited `WP-09a` block at the end of
`src/styles/sections.css`. Nothing else was touched.

---

## What shipped

`src/sections/hero.ts` exports `mount(root)` and `initScrub()` per contract C1.
`initScrub` is never called from this file, and this file creates no
ScrollTrigger and no pin. WP-10 calls it from the single `gsap.matchMedia()`
block in `main.ts`.

Left column, every string read from `copy.hero`, none written here:

| Element | Class | Source |
|---|---|---|
| Kicker, mono micro | `.micro .sec-hero__kicker .reveal` | `copy.hero.kicker` |
| H1, display serif `--t-hero`, `id="hero-title"` | `.sec-hero__title` with two `.sec-hero__line` spans | `copy.hero.h1a`, `copy.hero.h1b` |
| Lede, `--t-lede`, `--ink-muted`, 34em | `.lede .sec-hero__lede` | `copy.hero.lede` |
| Primary button to `#how` | `.btn .btn--primary` | `copy.hero.cta1` |
| Ghost button to the repo | `.btn .btn--ghost` | `copy.hero.cta2`, `GITHUB_URL` |
| Status line, mono micro, `--ink-faint` | `.micro .sec-hero__status .reveal` | `copy.hero.status` |

Right column: `.sec-hero__visual` wrapping `.fx-plasmid .sec-hero__map`,
mounted with `mountPlasmid(box)`, no `mini` flag. The `fx-plasmid` class is on
the element in the markup before `mountPlasmid` runs, per WP-06's class
contract.

Layout: one column by default with the visual below the copy purely by source
order; `55fr 45fr` at and above 901px. 901 is the only breakpoint the block
uses.

---

## Decisions

**1. The CTA goes through `scrollToTarget`, not a raw href jump.** The anchor
keeps a real `href="#how"` so keyboard activation, middle click and the section
16.4 link check all see a resolvable target, and the click handler calls
`scrollToTarget('#how')` from `core/scroll.ts`. Modified clicks (meta, ctrl,
shift, alt, non-primary button) are never hijacked. With Lenis uninstalled
under reduced motion, `scrollToTarget` falls through to a native scroll that
`scroll-margin-top: 80px` already accounts for.

**2. The hero does NOT override the shared section padding, and that is a CLS
decision, not a taste one.** `.sec-hero` is added by `mount()` in JS, and the
module script is deferred, so the browser paints the empty shells first. Any
geometry a JS-added class changes on the shell is therefore a layout shift.
Measured with a `padding-block` override in the block: CLS 0.0525 at 375px,
0.1088 at 900px and 0.0304 at 1440px under reduced motion. Removing the
override took all six measurements to exactly 0.0000. Every offset in the block
is now a margin on a child that does not exist before mount, so it cannot shift
anything. The section 12 budget is exactly 0.00 with zero tolerance.

**3. The hero load beats run on a clock, not on an IntersectionObserver.** Spec
7.1 says the beats fire once at boot and are not scroll driven.
`core/observe.ts#reveal` is the section 6.2 viewport reveal, which is a
different thing, and at 1440x900 the difference is not academic: the headline
set in `--t-hero` inside the 55 percent column runs six lines, which puts the
buttons at y=976 and the status line at y=1040, both under the observer
threshold. Measured with the observer path: 18 of the lede's word clips were
still at `opacity: 0` after the load timeline, and 4 were still at `opacity: 0`
after a full scroll sweep. An invisible primary call to action is the exact
failure the eight second rule in spec 0.3 cannot afford.

So `hero.ts` carries a local `settleOnLoad` that reuses WP-02's
`.reveal` / `.is-revealed` CSS contract unchanged, re-checks
`prefersReducedMotion()` at every deferral point exactly as `core/observe.ts`
does, and implements the section 6.6 will-change lifecycle including both
documented failure modes (listen for `propertyName === 'opacity'` only, plus a
`setTimeout` backstop). The H1 and the lede still go through WP-08's
`revealWords` with WP-08's own parameters; `settleWordsOnLoad` adds a clock
backstop on top of that call which only ever ADDS `is-revealed` to a word clip
and never removes anything.

Beats as shipped, all measured from boot:

```
t=0.00s   kicker
t=0.15s   H1 line A, per word, 45ms stagger
t=0.375s  H1 line B, per word, 45ms stagger (continues line A's stagger)
t=0.55s   lede, per word, 18ms stagger
t=0.80s   both buttons, together
t=2.40s   status line
```

The plasmid map is deliberately absent from that table. It mounts in an idle
callback and runs its own timeline inside `fx/plasmid.ts`, measured from the
moment seqviz reports mount complete. The two are never coupled.

**4. Two lines of copy, one `<h1>`.** Spec 13.2 allows the page exactly one
`<h1>`. Each copy line is a block `.sec-hero__line` span rather than a `<br>`,
because `fx/splitText.ts` rebuilds the inside of whatever it is handed and has
to be handed a line. Line B's delay continues line A's stagger, so the headline
reads as one sweep. The accessible name is the two intact strings from the
split's screen-reader layer, verified as
`Describe what you want to build. Get a design you can order.`

**5. No opacity in this section's own CSS, at all.** Every hidden-then-settled
state belongs to a shipped primitive (`.reveal`, `.fx-split--armed`,
`.fx-plasmid--armed`), and all three settle synchronously under reduced motion.
That is what makes the section 19 gate structural here rather than lucky, and
it is why the block carries no `@media (prefers-reduced-motion: reduce)` rule
of its own: it has nothing to settle.

**6. `initScrub` creates nothing.** The scroll-out motion in spec 7.1 is the
section 6.5 parallax, which is entirely declarative: `data-depth="far"` on the
two columns, with `core/motion.ts` owning the transform, the clamp and the
cached measurement. See the reopened-fix section at the end of this file for
why the attribute sits on the column rather than on the `<h1>`. A trigger here would mean two writers on one
transform. The export stays because C1 defines it and WP-10 calls it in
document order.

**7. Map sizing is CSS, not the `size` option.** `mountPlasmid`'s `size` option
writes an inline pixel width that goes stale on resize. `.sec-hero__map` caps
at 300px by default (spec 7.1's mobile size) and 500px at and above 901px, so
the reserved square is correct from first paint at every width and stays
correct across a resize.

---

## Gates

- `npx tsc --noEmit`: clean.
- `npm run build`: clean. The 500 kB chunk warning is the pre-existing seqviz
  and React bundle cost budgeted in spec 12, not a hero regression.
- No em dash, no emoji, no personal name, no banned product name in either
  file, and the built bundle greps clean for all of them.
- No importance flag, no `:not()` chain, no bare element selector, no bare
  `img` selector in the block. Every selector is prefixed `.sec-hero__`, max
  specificity (0,2,0). Only breakpoint 901 appears.
- No gradient, no glow, no glassmorphism, no stock imagery, no helix clip art,
  no emoji, no particle field, no typing effect, no custom cursor, no marquee.
- Every user-facing string comes from `copy.ts`. This package wrote none.

---

## Measured verification

Playwright with Chromium against a real `vite preview` build of `dist/`, at
375x812, 900x1200 and 1440x900, each with and without
`prefers-reduced-motion: reduce`. 192 checks, 0 failures. The suite asserts
pairwise bounding-box intersection across eleven scroll positions per viewport,
that the status line never dips below opacity 1 in any sampled frame, that its
colour is still `--ink-faint`, and that no hero element is left holding
`will-change`.

```
--- 375px ---
  [PASS] map container has a reserved square box before the map mounts  {"w":300,"h":300,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] one column below 901px  335px
  [PASS] visual sits BELOW the copy  copyBottom=711 visualTop=759
  [PASS] map is 300px square below 901px  300px
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

--- 375px reduced-motion ---
  [PASS] map container has a reserved square box before the map mounts  {"w":300,"h":300,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] one column below 901px  335px
  [PASS] visual sits BELOW the copy  copyBottom=711 visualTop=759
  [PASS] map is 300px square below 901px  300px
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

--- 900px ---
  [PASS] map container has a reserved square box before the map mounts  {"w":300,"h":300,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] one column below 901px  828px
  [PASS] visual sits BELOW the copy  copyBottom=577 visualTop=625
  [PASS] map is 300px square below 901px  300px
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

--- 900px reduced-motion ---
  [PASS] map container has a reserved square box before the map mounts  {"w":300,"h":300,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] one column below 901px  828px
  [PASS] visual sits BELOW the copy  copyBottom=577 visualTop=625
  [PASS] map is 300px square below 901px  300px
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

--- 1440px ---
  [PASS] map container has a reserved square box before the map mounts  {"w":468,"h":468,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  468x468
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] two columns at 901px and above  572px 467.984px
  [PASS] split is 55/45  55.0 / 45.0
  [PASS] map fills the right column, capped at 500px  468px in a 468px column
  [INFO] hero copy column bottom edge  statusBottom=847 viewport=900
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

--- 1440px reduced-motion ---
  [PASS] map container has a reserved square box before the map mounts  {"w":468,"h":468,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] left column data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] h1 rides the far layer  closest far ancestor found
  [PASS] h1 carries NO data-depth of its own (no nested transform)  null
  [PASS] status line does NOT carry .reveal (no opacity-zero initial state)  reveal=false
  [PASS] status line never dips below opacity 1 in ANY sampled frame  min sampled opacity=1
  [PASS] status line keeps --ink-faint unchanged  rgb(101, 110, 119)
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] no hero element is left holding will-change  all released
  [PASS] map box still square after mount  468x468
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] two columns at 901px and above  572px 467.984px
  [PASS] split is 55/45  55.0 / 45.0
  [PASS] map fills the right column, capped at 500px  468px in a 468px column
  [INFO] hero copy column bottom edge  statusBottom=862 viewport=900
  [PASS] no two hero element boxes intersect, at any scroll position  11 scroll positions clean
  [PASS] after a full scroll sweep, NO element in the hero is below opacity 1  0 hidden
  [PASS] zero console errors  0
  [PASS] zero unhandled rejections and page errors  0

================================
WP-09a VERIFY: ALL CHECKS PASS
```

### Note on the one intermittent console 404

An earlier run recorded a single `404` console error in one of the six passes.
It is `/favicon.svg`, which `index.html` links and which does not exist in
`public/` yet. `public/favicon.svg` is WP-13's file under contract C8. Chromium
requests it lazily and inconsistently, which is why it appeared in one pass and
in none of the re-runs. It is not a hero defect and there is nothing in this
package to change for it.

### Note on hero height at 1440x900

Measured, informational: the copy column's bottom edge lands at y=920 on a
900px-tall viewport, so the kicker, the headline, the lede and both buttons are
above the fold and only the last 20px of the status line is not. The status
line is the t=2.40s beat and the least load bearing string in the section.

---

## Summary

Section 01 builds its own DOM from `copy.hero`, runs the spec 7.1 load timeline
on a clock, and hosts the live plasmid map in a square box reserved before the
map mounts.

Measured CLS is exactly 0.0000 at all three viewports in both motion modes,
with zero console errors, zero unhandled rejections, and no element anywhere in
the hero below opacity 1.

---

## Reopened 2026-09-18: the headline overlapped the kicker

Reported by the coordinator against the deployed page: at 1440x900 the kicker
occupied y=151 to y=169 and the h1 box started at y=156, a 13px overlap.

### It was not the font

I pulled the coordinator's `base.css` change first, as instructed (Instrument
Serif moved from the width-matched `size-adjust: 135.09%` to Georgia's own
metrics, `size-adjust: 100%`, `ascent-override: 91.70%`,
`descent-override: 21.90%`) and rebuilt before touching anything.

That change was worth having: the headline went from six lines and 582px tall
to five lines and 465px tall, and the glyphs no longer print on top of the
kicker's glyphs. But the box overlap survived it, unchanged in cause and almost
unchanged in size. Measured on the rebuilt page at 1440x900:

```
.sec-hero__kicker   top 172.0  bottom 190.0   transform: none
#hero-title         top 177.2  bottom 641.9   transform: matrix(1,0,0,1,0,-28.84)
OVERLAP kicker x hero-title   12.8px vertical
```

### The actual cause: a lone parallax element inside a static stack

The heading's untransformed top is 206.0, which is the kicker's bottom of 190
plus the `--sp-4` gap of 16. Correct layout. The 28.84px that closed the gap is
the section 6.5 parallax transform, and it is present at `scrollY = 0`:

```
translateY = (1 - factor) * (scrollY - elementTop)
           = (1 - 0.86)   * (0 - 206.0)
           = -28.84px
```

That formula is not zero at rest for any element that is not at the very top of
the document. It is a standing upward offset of 0.14 times the element's own
document top. The kicker carries no `data-depth`, so it does not move with the
heading, and the 16px gap cannot absorb 28.84px.

Worse, the offset changes sign. Once `scrollY` passes the heading's top the
transform becomes positive and the heading slides DOWN through the lede, all
the way to the section 6.5 clamp of +80px. Measured with `data-depth` on the
`<h1>`, at 1440x900:

| scrollY | `#hero-title` x `.sec-hero__lede` |
|---|---|
| 0 | no overlap (it is overlapping the kicker instead, by 12.8px) |
| 500 | 10.4px |
| 600 | 24.4px |
| 700 | 38.4px, and the descenders of "you can order." visibly touch the lede |
| 1000 and beyond | 56.0px, the clamp |

Confirmed visually in screenshots at both ends. So the reported kicker overlap
was one half of a single defect: the heading has 115.6px of travel relative to
neighbours that have none, and 24px of clearance below it.

### The fix: one transformed layer per column

In `hero.ts`, `data-depth="far"` moved off the `<h1>` and onto
`.sec-hero__copy`, the left column. `.sec-hero__visual` keeps its own. The
heading still rides the far depth exactly as spec 7.1 asks, but every element
in the column now shares one offset, so internal spacing is rigid at every
scroll position and nothing inside can collide with anything else inside. The
column separates from the rest of the page as the visitor leaves, which is the
motion spec 7.1 describes.

This is the general rule the defect teaches, and it applies to every section,
not just this one: **`data-depth` belongs on a layer, never on a single element
that has static siblings above or below it.** A loose `data-depth` element
inside a tight vertical stack will walk through its neighbours across a range
of `0.14 * elementTop + 80` pixels.

An intermediate fix that only widened the kicker gap to `--sp-16` is recorded
here as rejected: it cleared the kicker (28.4px of clearance, measured) but did
nothing about the heading walking down into the lede, and buying that clearance
too would have meant a 96px gap that reads as a 131px hole at rest, which is
the worst possible trade in the first eight seconds.

`.sec-hero__title`'s desktop `margin-block-start` is now `--sp-8`, and it is
purely typographic: at the 5.25rem ceiling the headline needs more air under a
12px kicker than the `--sp-4` that suits the 2.75rem floor on a phone. It is no
longer doing any motion work.

### Measured after

At 1440x900, `scrollY = 0`:

```
.sec-hero__kicker   top 147.9  bottom 165.9
#hero-title         top 197.9  bottom 662.7     32.0px clear of the kicker
.sec-hero__lede     top 686.7  bottom 806.0     24.0px clear of the heading
.sec-hero__actions  top 838.0  bottom 878.0
.sec-hero__status   top 902.0  bottom 920.0
.sec-hero__visual   top 278.7  bottom 746.7
```

Those gaps are now constant at every scroll position, because both columns are
rigid. Pairwise bounding-box intersection, every pair of the six hero elements,
at scrollY 0, 100, 200, 300, 400, 500, 600, 700, 800, 1000 and 1200:

```
375x812    no overlap at any scroll position
900x1200   no overlap at any scroll position
1440x900   no overlap at any scroll position
1440x1200  no overlap at any scroll position
1920x1080  no overlap at any scroll position
```

### The lesson for the verification suite

The coordinator's point is correct and worth keeping: 150 passing checks did
not catch this, because opacity and CLS assertions cannot see overlap. CLS was
a genuine 0.0000 the whole time, since the parallax is a transform and
transforms are excluded from layout-shift scoring by design. Every element was
at opacity 1. The section was still visually broken.

The suite now carries a pairwise bounding-box intersection assertion over all
six laid-out hero elements, run at eleven scroll positions per viewport, at
375, 900 and 1440, in both motion modes. It fails on any intersection over
0.5px. Total is now 168 checks, 0 failures.

---

## Reopened 2026-09-18: Lighthouse contrast on the status line

Reported by WP-14: Lighthouse Accessibility measured 96, 100, 96, 96 over four
runs against the spec section 12 target of 98. Every failing run named one
node, always the same one, the hero status line, and reported three different
contrast ratios for it: 4.31:1, then 4.02:1, then 2.73:1.

### Diagnosis, which WP-14 had right

Three different foregrounds for one element is the signature of a partially
transparent sample, not of a wrong colour. `--ink-faint` measures 4.93:1 on
`--paper` and passes AA in its settled state, with 0.43 of margin. The status
line is the last beat on the load timeline at t=2.40s, and its old reveal was
`.reveal` / `.is-revealed`, which transitions opacity from 0 to 1 over 600ms.
Lighthouse scores contrast from a single sampled frame, and it was landing
inside that window. The site was already meeting WCAG AA; what failed was a
number derived from one frame of an animation.

This is a genuine three-way tension in the spec, not a defect in any one
package: section 7.1 wants this beat at t=2.40s, section 5.2 fixes the colour
at a value with very little headroom, and section 12 wants a single-frame
score.

### Fix: WP-14's option 1, transform only

The status line no longer animates opacity at all, and never holds a value
below 1 at any instant. It is hidden before its beat by GEOMETRY: the
paragraph is an `overflow: hidden` clip box and the inner span sits below it
on a transform, which is the same clip-from-below vocabulary WP-08 already
uses for the headline. Any frame Lighthouse samples now reads the settled
colour, because there is no other colour to read.

Three things stayed untouched on purpose: `--ink-faint` (it is correct and it
is the spec's own verified value), `tokens.css` (not mine, and nothing in it
needed changing), and the t=2.40s beat itself. Verified by screenshot that the
line is still fully absent at t=1.5s and fully present at t=4.0s, so the
motion reads exactly as before.

I did not take WP-14's option 2, the 0.92 starting opacity, and agree with
their reasoning: it leaves the element permanently below full opacity, which
is both a hack and a live risk to the "nothing sits at opacity 0" family of
reduced-motion checks.

### The transitionend interaction, which was a real hazard

The coordinator flagged this and it was correct to. `settleOnLoad`'s
will-change lifecycle is keyed to the opacity `transitionend`, exactly as spec
section 6.6 prescribes, and removing the opacity transition would have left a
listener waiting for an event that can never arrive. The `setTimeout` backstop
would have cleaned it up, but leaning on the backstop for the normal path is
the wrong shape.

`settleOnLoad` therefore takes a `{ fadesOpacity }` option, and the status line
passes `false`. On that path nothing is hinted, nothing is listened for and
nothing needs cleaning up: the transform is a single short slide on one line of
text, so a compositor hint would cost more bookkeeping than it saves. The
element also no longer carries `.reveal`, because `.reveal` IS the opacity-zero
initial state it must never have.

The suite now asserts positively that no hero element is left holding
`will-change` after the timeline. It passes in all six passes.

### Measured after

Lighthouse via the repo's own `@lhci/cli` 0.14.0 toolchain, against a real
`vite preview` build, nine consecutive default runs (six on the first build of
the fix, three more to confirm on a rebuild):

```
run 1: accessibility=100  color-contrast=1
run 2: accessibility=100  color-contrast=1
run 3: accessibility=100  color-contrast=1
run 4: accessibility=100  color-contrast=1
run 5: accessibility=100  color-contrast=1
run 6: accessibility=100  color-contrast=1
run 7: accessibility=100  color-contrast=1
run 8: accessibility=100  color-contrast=1
run 9: accessibility=100  color-contrast=1
```

Nine of nine at 100, against 96 / 100 / 96 / 96 before. The `color-contrast`
audit passes with zero failing nodes in every run, where it previously named
this element.

Opacity sampled on every animation frame for the first 5 seconds, at 1440x900:

```
reduced-motion off   minimum opacity of .sec-hero__status and its inner span = 1
                     transform slides 22.5px -> 0 starting at t=2.42s
reduced-motion on    settled on the first sampled frame, transform 0
```

Own suite: 192 checks, 0 failures. CLS still exactly 0.0000 in all six passes
(the clip box reserves its space whether or not the line has revealed), no
element below opacity 1, no box intersections at any of eleven scroll positions
per viewport, nothing holding `will-change`, zero console errors, zero
unhandled rejections.

### One note on tooling

`lhci collect` and the `lighthouse` CLI both throw `EPERM` on this Windows box
when chrome-launcher tries to remove its own temp directory, AFTER the audit
has completed and the report has been written. The JSON reports are complete
and correct; only the cleanup step fails. Scores above were read from those
reports. Worth knowing before someone reads the stack trace as a failed audit.

---

## Independent re-verification 2026-09-18 (replacement agent for WP-09a-fix)

This package was handed back with the premise that the previous run had left no
source changes on disk. That premise was wrong, and the first thing worth
recording is the actual state of the tree. Both owned files already carried the
transform-only fix in full, and `git log -S fadesOpacity` shows it committed in
`4871b1c`: the orchestrator's bundle-deferral commit swept the whole tree, so
the hero fix rode along inside it. Nothing needed writing. What was missing was
an independent measurement, so that is what this run produced. **No line of
`src/sections/hero.ts` or of the `WP-09a` block in `src/styles/sections.css` was
changed by this run.**

### Method, and why it differs from the run above

Lighthouse via the repo's own `@lhci/cli` 0.14.0 toolchain. `lhci collect` dies
on this box with the `EPERM` chrome-launcher cleanup fault recorded above, and
in this run it died BEFORE writing any report, so `.lighthouseci` was empty and
no score could be read from it. The bundled `lighthouse` CLI from the same
install writes its JSON report first and only then hits the same `EPERM`, so
every number below was read from a complete report written by that binary,
desktop preset, headless, against a real `vite preview` of `dist/`.

The pre-fix arm cannot be produced by editing the source, because the source is
the thing under test and other packages were building against the same tree. It
was reconstructed instead as an isolated copy of `dist/` in a scratch directory,
with three rules appended to the built stylesheet that restore exactly the old
behaviour: `opacity: 0` plus `translateY(14px)` on the paragraph, the inner span
parked at rest, and `opacity 600ms var(--ez-out-expo)` on `.is-revealed`. The
paragraph still receives `is-revealed` from `settleOnLoad` at t=2.40s, so the
fade is the original fade. Confirmed by sampling every animation frame at
1350x940: **34 partially transparent frames, running from t=2.19s to t=2.79s**,
which is the hazard WP-14 described, present and measurable in the pre-fix arm.

### Measured Lighthouse Accessibility

| Arm | Runs | Accessibility | `color-contrast` |
|---|---|---|---|
| Before, of record (WP-14, section 12 of `progress/WP-14.md`) | 4 default | **96, 100, 96, 96** | fails on 3 of 4, one node |
| Before, reconstructed here | 15 | **100 on all 15** | passes on all 15 |
| After, as shipped | 14 | **100 on all 14** | passes on all 14 |

The after arm is 14 runs: 4 desktop preset through a plain static server, 4 at
the default mobile throttling, and 6 desktop preset through `vite preview`.

### The honest part: the reconstructed before arm did not reproduce the 96

Fifteen runs against a faithful reconstruction of the old fade all scored 100.
That is a weak result on its own, so it was controlled rather than waved away.

**Positive control.** A third copy of `dist/` was built with the status line
pinned at a permanent `opacity: 0.6`, so it is partially transparent in every
frame rather than for 600ms. One run:

```
accessibility=96   color-contrast=0
  div.container > div.sec-hero__copy > p.micro > span.sec-hero__status-line
  Element has insufficient color contrast of 2.33 (foreground color: #a1a6aa,
  background color: #faf9f7, font size: 9.0pt (12px), font weight: normal)
```

96, `color-contrast` failing, one node, and it is the same node in the same
place WP-14 named. **The harness detects this exact defect.** So the 100s on the
after arm mean something, and the 100s on the before arm mean only that
Lighthouse's snapshot did not land inside the 600ms window on those particular
runs. Sweeping `pauseAfterLoadMs` from 0 to 2700 did not move it into the
window either, which suggests that setting is inert in this Lighthouse version.

That is the finding underneath the finding, and it strengthens the case for the
fix rather than weakening it: **whether this element fails is a lottery over a
600ms window, and the outcome depends on how fast the machine is.** WP-14's box
landed inside the window 3 times in 4. This box landed inside it 0 times in 15.
Tuning a fade to survive that lottery would have been a guess. Removing the
partially transparent frames removes the lottery, and that is what shipped.

### Rendered contrast, frame by frame, on the shipped page

The deterministic assertion, which does not depend on where any sampler happens
to land. The status line's effective alpha is the product of its own and every
ancestor's opacity, composited against `--paper`, on every animation frame for
the first 5 seconds:

```
375x812            frames=296  min alpha=1  partial=0  min ratio=4.93:1
375x812  reduced   frames=300  min alpha=1  partial=0  min ratio=4.93:1
900x1200           frames=301  min alpha=1  partial=0  min ratio=4.93:1
900x1200 reduced   frames=300  min alpha=1  partial=0  min ratio=4.93:1
1440x900           frames=301  min alpha=1  partial=0  min ratio=4.93:1
1440x900 reduced   frames=301  min alpha=1  partial=0  min ratio=4.93:1
```

First sampled frame 4.93:1, last sampled frame 4.93:1, at every viewport, in
both motion modes. There is no other value for Lighthouse to read.

### The `transitionend` interaction, verified rather than reasoned about

Spec section 6.6 keys the will-change lifecycle to the opacity `transitionend`
on purpose, so an element that no longer transitions opacity would strand a
listener on an event that can never arrive. `settleOnLoad`'s `fadesOpacity`
option is the structural answer: on that path no hint is written, no listener is
registered and no backstop is needed, so there is nothing to strand. The
observable proof is that `el.style.willChange` is empty on all six hero elements
after the timeline, which requires every element that DID take the hinted path
to have been cleaned up by either the event or the `setTimeout` backstop. That
assertion passes in all six passes. The status line is in the checked set and
never holds the hint at all.

### Own suite: 151 checks, 0 failures, exit 0

Playwright with Chromium against `vite preview` of a fresh `dist/`, at 375x812,
900x1200 and 1440x900, each with and without `prefers-reduced-motion: reduce`.
Everything the hero had already proved is re-asserted, not assumed:

- measured CLS **exactly 0.0000** in all six passes
- pairwise bounding-box intersection across all six hero elements at **eleven
  scroll positions per viewport**, driven by real wheel events because Lenis
  reverts a programmatic jump: clean at every position in every pass
- `data-depth="far"` on `.sec-hero__copy` and `.sec-hero__visual`, and `null` on
  the `<h1>` itself
- exactly one `<h1>`, `id="hero-title"`, accessible name read from the
  accessibility tree through the DevTools Protocol, not from `textContent`:
  `"Describe what you want to build. Get a design you can order."`
- the status line does not carry `.reveal`, keeps `rgb(101, 110, 119)`, and
  reads its string from `copy.ts`
- nothing in the hero below opacity 1 after the timeline or after a full sweep,
  in either motion mode
- the map container is a 300px or 468px square carrying `fx-plasmid` in the
  markup with zero SVGs inside it before `mountPlasmid` runs
- zero console errors, zero page errors, zero unhandled rejections

One harness defect was found and fixed rather than tolerated: comparing the
headline's accessible name against `textContent` fails, because the two copy
lines are block spans and a raw text join drops the space the name computation
inserts at a block boundary. It read `build.Get`. The assertion now reads the
computed name from the accessibility tree, which is what an assistive technology
does, and it matches exactly.

### Gates

- `npx tsc --noEmit`: clean.
- `npm run build`: clean. The 500 kB chunk warning is the pre-existing 3Dmol
  chunk, which spec section 12 excludes from the initial budget.
- `node qa/a11y.mjs`: **PASS, exit 0**, against this build. Zero axe violations,
  contrast clean at all three viewports, tightest rendered pair 4.56:1.
- No em dash, no emoji, no personal name and no banned brand string in either
  owned file or in this note. This package wrote no user-facing string.

### Process

Four servers were started and each was stopped by its own captured PID: three
static servers on 4271, 4272 and 4273 and one `vite preview` on 4173. No pattern
match across node processes was used. Every temporary file lived in the session
scratchpad; the repository is left with no artifact of this run except this note
and the two `PROGRESS.md` lines.
