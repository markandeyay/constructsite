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
H1 and on the right column, with `core/motion.ts` owning the transform, the
clamp and the cached measurement. A trigger here would mean two writers on one
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
`prefers-reduced-motion: reduce`. 150 checks, 0 failures.

```
--- 375px ---
  [PASS] map container has a reserved square box before the map mounts  {"w":300,"h":300,"ar":"1 / 1","svgs":0}
  [PASS] hero root carries .sec-hero  sec-hero
  [PASS] exactly one h1 on the page  count=1
  [PASS] h1 id is hero-title  hero-title
  [PASS] h1 accessible name is both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 renders both copy lines, once  Describe what you want to build. Get a design you can order.
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] one column below 901px  335px
  [PASS] visual sits BELOW the copy  copyBottom=768 visualTop=816
  [PASS] map is 300px square below 901px  300px
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
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] one column below 901px  335px
  [PASS] visual sits BELOW the copy  copyBottom=768 visualTop=816
  [PASS] map is 300px square below 901px  300px
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
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] one column below 901px  828px
  [PASS] visual sits BELOW the copy  copyBottom=577 visualTop=625
  [PASS] map is 300px square below 901px  300px
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
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  300x300
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] one column below 901px  828px
  [PASS] visual sits BELOW the copy  copyBottom=577 visualTop=625
  [PASS] map is 300px square below 901px  300px
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
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  468x468
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=false
  [PASS] two columns at 901px and above  572px 467.984px
  [PASS] split is 55/45  55.0 / 45.0
  [PASS] map fills the right column, capped at 500px  468px in a 468px column
  [INFO] hero copy column bottom edge  statusBottom=1044 viewport=900
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
  [PASS] h1 data-depth=far  far
  [PASS] right column data-depth=far  far
  [PASS] kicker string from copy.ts  DESIGN AUTOMATION FOR BIOLOGY
  [PASS] lede string from copy.ts  Construct turns plain-English intent into ...
  [PASS] status string from copy.ts  LIVE · OPEN SOURCE · MIT LICENSED
  [PASS] primary CTA text and #how anchor  See how it works
  [PASS] ghost CTA text and GITHUB_URL  {"text":"Read the code","href":"https://github.com/markandeyay/constructsite"}
  [PASS] after the load timeline, NO element in the hero is below opacity 1  0 hidden
  [PASS] map box still square after mount  468x468
  [PASS] map rendered an svg  svgs=1
  [PASS] map svg carries role=img and aria-label  role=img+label
  [PASS] measured CLS is exactly 0.00  CLS=0.0000
  [PASS] no-motion class matches emulation  no-motion=true
  [PASS] two columns at 901px and above  572px 467.984px
  [PASS] split is 55/45  55.0 / 45.0
  [PASS] map fills the right column, capped at 500px  468px in a 468px column
  [INFO] hero copy column bottom edge  statusBottom=1044 viewport=900
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

Measured, informational, not a failure: with `--t-hero` at its 5.25rem ceiling
inside the 55 percent column (572px), the headline runs six lines and the copy
column's bottom edge lands at y=1044 on a 900px-tall viewport. The kicker, the
headline and the lede are all above the fold; the buttons and the status line
sit just below it at that particular viewport height. Both the type token and
the 55/45 split are fixed by the spec, so this is not adjustable from inside
this package. It is recorded here so WP-11's responsive pass and WP-17's review
can see the number rather than rediscover it. Because the load beats are clock
driven, nothing is stranded invisible: scrolling a few pixels reveals fully
settled elements, never hidden ones.

---

## Summary

Section 01 builds its own DOM from `copy.hero`, runs the spec 7.1 load timeline
on a clock, and hosts the live plasmid map in a square box reserved before the
map mounts.

Measured CLS is exactly 0.0000 at all three viewports in both motion modes,
with zero console errors, zero unhandled rejections, and no element anywhere in
the hero below opacity 1.
