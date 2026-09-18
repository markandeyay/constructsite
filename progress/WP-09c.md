# WP-09c: Section 03, How it works

Claimed 2026-09-18T02:20:00Z. Done 2026-09-18T02:52:00Z.

Owns: `src/sections/how.ts` and ONE delimited block in `src/styles/sections.css`
(`/* ==== WP-09c: How it works ==== */` to `/* ==== /WP-09c ==== */`, appended at
the end of the file). Nothing else was touched.

Summary, two lines:
The one pinned section on the page is built, pinned for five viewport heights
expressed as a function, with the five-step pipeline advancing across the scrub.
Below 901px and under reduced motion it renders as the stacked five-card variant
with every step readable and nothing at opacity 0.

---

## 1. What was built

`mount(root)` builds, per BUILD_CONTRACT C1 and C5:

```
#how.sec-how
  .sec-how__inner                 <- the pin target
    .container
      header.sec-head             <- num (aria-hidden) / kicker / h2#how-title / rule
      .sec-how__body
        ol.sec-how__steps
          li.sec-how__step.reveal  x5
            h3.sec-how__label      <- copy.how.steps[i].label
            p.sec-how__line        <- copy.how.steps[i].line
            .sec-how__vis          <- that step's visual
```

The five visual states, spec section 7.3:

| Step | Visual | Source of every string |
|---|---|---|
| 1 Describe | mono prompt that types out, scrubbed by scroll | `copy.how.steps[0].line` |
| 2 Retrieve | three record cards slide in and stack | no string, hairline bars only, `aria-hidden` |
| 3 Generate | `mountPlasmid(el, { mini: true })` | `fx/plasmid.ts`, own aria-label |
| 4 Validate | checks tick down a list, each with a drawn pass mark | `copy.validation.rows[].label` |
| 5 Export | three file chips | `copy.how.chip1`, `chip2`, `chip3` |

No user-facing string is written by this package. Every word comes from
`copy.ts`.

The typing effect in step 1 is the one permitted typing effect on the site
(spec section 2.4) and it is driven by scroll progress, never by a timer. There
is no `setInterval`, no `setTimeout` and no GSAP tween behind it: the character
count is a pure function of `ScrollTrigger` progress, so scrubbing backwards
un-types it.

## 2. The pin, and what this package deliberately does not do

`initScrub()` is exported and is NEVER called from this module. No
`gsap.matchMedia` block and no ScrollTrigger exists at module scope or inside
`mount`. WP-10 calls `initScrub` from the single `gsap.matchMedia()` block in
`main.ts`, in document order, for the reason spec section 6.4 sets out at
length: ScrollTrigger measures start positions at creation time, so a pin
created out of order measures against a document that does not yet contain the
other pin spacers.

`initScrub` returns a cleanup function, which GSAP registers as the matchMedia
cleanup. It kills the trigger, removes the staged class and settles every step
into its finished, fully visible state.

The trigger is exactly the spec section 7.3 shape, with the end distance as a
FUNCTION so it is re-evaluated on refresh rather than baked in:

```ts
ScrollTrigger.create({
  trigger: '#how',
  pin: '.sec-how__inner',
  start: 'top top',
  end: () => '+=' + window.innerHeight * 5,
  scrub: 1,
  invalidateOnRefresh: true,
  onUpdate: (self) => apply(self.progress),
  onRefresh: (self) => apply(self.progress),
});
```

Exactly one ScrollTrigger is created by this package. Progress maps onto the
five steps as five equal bands; each band spends its first 72% animating and
holds the finished state for the rest, so a step is legible before the next one
takes over. Every write is guarded against churn: a class or a text slice is
only written when the value actually changed.

## 3. Why no step can become unreachable

Spec section 13.1 warns that a pinned staged section which keeps its layout but
loses its scroll driver makes content permanently unreachable. The guard here is
structural, not a coat of paint:

1. Every CSS rule in this block that can produce `opacity: 0` sits inside
   `@media (min-width: 901px) and (prefers-reduced-motion: no-preference)`,
   which is the section 6.4 motion gate written out, character for character.
2. Inside that query, each such rule is additionally scoped to
   `.sec-how--staged`.
3. That class is added at exactly one place in the whole codebase: inside
   `initScrub`, which only `main.ts` calls, and only from a matchMedia block
   whose query already carries both gates.
4. A `.no-motion` backstop and a `@media (prefers-reduced-motion: reduce)`
   backstop close the block, both at (0,2,0) and both last in source order, so
   they win on order if a user flips the OS setting while the staged class is
   still on the element.

So below 901px, with reduced motion on, or if the scrub never runs for any
reason at all, the section is the stacked five-card variant with every step at
full opacity.

## 4. Measured verification

Verified with `playwright` (Chromium) against a THROWAWAY harness that mirrored
`main.ts` exactly and added the single `gsap.matchMedia(MQ_DESKTOP_MOTION)`
block calling `how.initScrub()` in document order, which is precisely how WP-10
will call it. The harness (`harness.html`, `src/wp09c-harness.ts`) and the
verification script were DELETED after the run. `main.ts` and `index.html` were
never edited.

Measured output, pasted verbatim:

```
=== 1440x900, reduced motion OFF ===
sec-how--staged present: true
ScrollTrigger total=1 pins=1 scrubs=1
ranges: [{"start":1748,"end":6248,"pinned":true}]
pin: {"start":1748,"end":6248,"distance":4500,"vh":900,"pinClass":"sec-how__inner"}
expected pinned distance 5 * vh = 4500
  p=0.0 y=1748 activeStep=0 visOn=0 typedChars=0 partsIn=0 innerTop=403
  p=0.1 y=2198 activeStep=0 visOn=0 typedChars=32 partsIn=0 innerTop=0
  p=0.2 y=2648 activeStep=0 visOn=0 typedChars=53 partsIn=0 innerTop=0
  p=0.3 y=3098 activeStep=1 visOn=1 typedChars=53 partsIn=2 innerTop=0
  p=0.4 y=3548 activeStep=1 visOn=1 typedChars=53 partsIn=3 innerTop=0
  p=0.5 y=3998 activeStep=2 visOn=2 typedChars=53 partsIn=3 innerTop=0
  p=0.6 y=4448 activeStep=2 visOn=2 typedChars=53 partsIn=3 innerTop=0
  p=0.7 y=4898 activeStep=3 visOn=3 typedChars=53 partsIn=6 innerTop=0
  p=0.8 y=5348 activeStep=3 visOn=3 typedChars=53 partsIn=7 innerTop=0
  p=0.9 y=5798 activeStep=4 visOn=4 typedChars=53 partsIn=9 innerTop=0
  p=1.0 y=6248 activeStep=4 visOn=4 typedChars=53 partsIn=10 innerTop=0
distinct active steps across the pinned range: [0,1,2,3,4]  ALL FIVE ADVANCE
pinned innerTop mid-range: [0]
active step colour / border at p=0.5: rgb(20, 23, 26) | 2px rgb(31, 107, 74)
inactive step colour / border: rgb(101, 110, 119) | rgb(226, 223, 217)

=== 900px, reduced motion OFF ===
sec-how--staged present: false   (expected false)
ScrollTrigger total=0 pins=0 scrubs=0   (expected 0 pins, 0 scrubs)
  step 1 "Describe" lineChars=53 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 2 "Retrieve" lineChars=54 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 3 "Generate" lineChars=78 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 4 "Validate" lineChars=71 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 5 "Export" lineChars=82 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 375px, reduced motion OFF ===
sec-how--staged present: false   (expected false)
ScrollTrigger total=0 pins=0 scrubs=0   (expected 0 pins, 0 scrubs)
  step 1 "Describe" lineChars=53 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 2 "Retrieve" lineChars=54 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 3 "Generate" lineChars=78 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 4 "Validate" lineChars=71 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
  step 5 "Export" lineChars=82 stepOpacity=1 visOpacity=1 visVis=visible rendered=true
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 1440px, reduced motion ON ===
sec-how--staged present: false   (expected false)
ScrollTrigger total=0 pins=0 scrubs=0   (expected 0 pins, 0 scrubs)
html.no-motion: true
  step 1 "Describe" lineChars=53 stepOpacity=1 visOpacity=1 rendered=true
  step 2 "Retrieve" lineChars=54 stepOpacity=1 visOpacity=1 rendered=true
  step 3 "Generate" lineChars=78 stepOpacity=1 visOpacity=1 rendered=true
  step 4 "Validate" lineChars=71 stepOpacity=1 visOpacity=1 rendered=true
  step 5 "Export" lineChars=82 stepOpacity=1 visOpacity=1 rendered=true
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 375px, reduced motion ON ===
sec-how--staged present: false   (expected false)
ScrollTrigger total=0 pins=0 scrubs=0   (expected 0 pins, 0 scrubs)
html.no-motion: true
  step 1 "Describe" lineChars=53 stepOpacity=1 visOpacity=1 rendered=true
  step 2 "Retrieve" lineChars=54 stepOpacity=1 visOpacity=1 rendered=true
  step 3 "Generate" lineChars=78 stepOpacity=1 visOpacity=1 rendered=true
  step 4 "Validate" lineChars=71 stepOpacity=1 visOpacity=1 rendered=true
  step 5 "Export" lineChars=82 stepOpacity=1 visOpacity=1 rendered=true
all five steps readable: true
elements at opacity 0 inside #how: 0

=== totals ===
console errors: 0
page errors / unhandled rejections: 0
```

Reading of the 1440px numbers:

- The pinned distance measured 4500px against a 900px viewport, which is
  exactly five viewport heights.
- The pin element is `.sec-how__inner`, and its viewport top held at 0 across
  every sample inside the range, so the pin engages and holds.
- The active step took all five values 0 through 4 across the range, in order,
  with the persistent diagram's visible state tracking it one for one.
- The prompt typed from 0 to its full 53 characters across step 1's band and
  stayed complete afterwards, driven by progress alone.
- The active step measured `rgb(20, 23, 26)` (`--ink`) with a `2px`
  `rgb(31, 107, 74)` (`--accent`) left border; inactive steps measured
  `rgb(101, 110, 119)` (`--ink-faint`) with a `--rule` border. That is spec
  section 7.3's requirement, measured.

At 900px and 375px, and under reduced motion at both 1440px and 375px: zero
pins, zero scrubs, the staged class absent, all five steps readable, and zero
elements at `opacity: 0` anywhere inside `#how`. Zero console errors and zero
unhandled rejections across all five runs.

## 5. Gates

- `npx tsc --noEmit` clean.
- `npm run build` clean.
- No em dash (U+2014), no emoji in either owned file.
- No `!important` and no `:not()` styling chain in the CSS block. The only
  occurrence of the string `important` is in a comment restating the rule.
- No gradient of any kind, no glow, no `backdrop-filter`, no `box-shadow` in a
  hue, no stock imagery, no helix clip art, no particle field, no marquee, no
  custom cursor.
- No personal name, no forbidden product name, in either file.
- Max specificity in the block is (0,2,0). Every selector is prefixed
  `.sec-how` or is the `.fx-plasmid` class the map's own block owns and this
  block does not restyle.
- No raster image is added anywhere in this section, so the spec section 7.3
  `loading="eager"` rule has nothing to bind. The one piece of media is the
  mini plasmid map, whose container carries `fx-plasmid` in the markup before
  `mountPlasmid` runs, which reserves its aspect-ratio box. Nothing in this
  section can shift layout after measurement.

## 6. Decisions

1. **No dedicated prompt string exists in `copy.ts`.** The BUILD_CONTRACT C3
   shape for `copy.how` carries `num`, `kicker`, `title`, `steps` and the three
   chips, and no prompt key. Rather than invent one, step 1 types out
   `copy.how.steps[0].line`. Logged as a cross-WP request to WP-04.
2. **The prompt visual is `aria-hidden`.** It repeats, character for character,
   the step line already present in the left column, and a half-typed string in
   the accessibility tree is noise. The record cards are `aria-hidden` too:
   they are hairline bars carrying no text. The map, the check rows and the
   file chips stay in the tree.
3. **Step 4's labels come from `copy.validation.rows`.** Those four check names
   are the only check names in `copy.ts`, and this step is a diagram of the same
   engine. The pass mark is a drawn SVG path marked `aria-hidden`, with no
   verdict word attached, so nothing here asserts a result the validation
   section has not already qualified.
4. **`.sec-how--staged` rather than a pure media query.** A desktop visitor with
   motion on would otherwise get the staged layout from CSS alone even if
   `initScrub` never ran, which would hide four of the five steps. Gating on a
   class the scrub itself adds makes that impossible.
5. **The mini map mounts through `observeOnce` at a 400px root margin.** The
   box is reserved before it lands, so the deferral costs no layout stability
   and saves a second seqviz render on a visitor who never reaches section 03.
   The promise is caught, so a map failure can never surface as an unhandled
   rejection.
6. **The section title goes through `revealWords(title, { staggerMs: 40 })`.**
   Per WP-08's contract, this block writes no opacity onto `.sec-head__title`
   or onto anything inside it.
7. **Step cards use the shared `.reveal` primitive** for the stacked variant, at
   a 70ms stagger, which settles synchronously under reduced motion.

---

# WP-09c REOPENED: spec section 12 CLS violation, fixed

Reopened 2026-09-18T03:20:00Z. Closed again 2026-09-18T03:58:00Z.

WP-11 measured a live CLS violation in this section on a STEPPED scroll sweep at
and above 901px with motion allowed. The spec section 12 budget is exactly 0.00.
Confirmed, diagnosed, fixed, and re-measured at 0.000000 attributable to
`.sec-how` at every width in both motion modes.

## Measured, before and after

Method: `PerformanceObserver` on `layout-shift` installed via an init script
before first paint, `buffered: true`, `hadRecentInput` entries discarded.
STEPPED sweep only, one viewport third per jump with a settle between jumps,
across the full document height. Fresh browser context per viewport. The harness
is the one described above: it mirrors `main.ts` and calls `how.initScrub()`
from one `gsap.matchMedia(MQ_DESKTOP_MOTION)` block, in document order.

"attributable to .sec-how" is the sum of every layout-shift entry naming a node
inside this section as a source.

| Viewport | Mode | CLS attributable to .sec-how BEFORE | AFTER |
|---|---|---|---|
| 901x900 | motion | 0.1003 | **0.000000** |
| 1024x768 | motion | 0.1283 | **0.000000** |
| 1440x900 | motion | 0.0940 | **0.000000** |
| 1920x1080 | motion | 0.0620 | **0.000000** |
| 901x900 | reduced | 0.000000 | **0.000000** |
| 1024x768 | reduced | 0.000000 | **0.000000** |
| 1440x900 | reduced | 0.000000 | **0.000000** |
| 1920x1080 | reduced | 0.000000 | **0.000000** |

Zero console errors and zero page errors across all eight runs, before and after.

The dominant BEFORE entries, straight from the layout-shift sources at 1440x900:

```
DIV.sec-how__vis sec-how__vis--on  [265,0,243,243] -> [742,323,530,320]  value 0.0632
DIV.sec-how__vis                   [262,0,249,101] -> [739,321,536,83]   value 0.0307
```

AFTER, at every width in both modes, no layout-shift entry names any node in
this section at all.

## The real mechanism, which was not only the staged class

Two causes, found by probing the element's containing block frame by frame
rather than by reading the CSS.

1. **The staged geometry was switched on by JavaScript.** `.sec-how__vis` was
   laid out in its stacked position, then `initScrub` added `.sec-how--staged`,
   which moved it to `position: absolute`. That is WP-11's diagnosis and it was
   correct.

2. **The diagram's containing block flipped underneath it.** This was the larger
   half, and moving the geometry into the media query alone did NOT fix it: the
   numbers barely moved, and the "previous" rect was still the step-sized box.
   The cause is that `.reveal` in `base.css` carries
   `transform: translateY(14px)`, and `core/observe.ts` adds
   `will-change: transform` for the duration of the transition and removes it
   afterwards. A transform, and a `will-change: transform`, each make an element
   the containing block for its absolutely positioned descendants. The diagram
   was a child of the revealing step, so its 48% box resolved against the step
   (roughly 249px wide) and jumped to `.sec-how__body` (roughly 536px wide) when
   the hint was dropped. That flip is what the sources above are showing: the
   width changes as well as the position, which is the tell.

## The fix

Three changes, all inside files this package owns.

1. **Desktop geometry now applies at first paint.** Everything that sets a box
   (`.sec-how__inner`, `.sec-how__body`, `.sec-how__steps`, `.sec-how__vis`)
   lives in `@media (min-width: 901px) and (prefers-reduced-motion:
   no-preference)` and is no longer gated on `.sec-how--staged`. The staged
   class now carries only opacity, visibility, colour and active-step state,
   none of which can move anything.

2. **The reveal moved off the step onto a sibling.** Each step is now
   `li.sec-how__step > div.sec-how__steptext.reveal` plus
   `div.sec-how__vis.reveal`. The diagram is a SIBLING of the revealing text,
   not its child, so no ancestor of the diagram is ever transformed and its
   containing block is `.sec-how__body` from the first frame to the last. A
   transform on the diagram itself is harmless: the layout instability API does
   not score transform movement.

3. **No root box override was introduced.** `.sec-how--staged { padding-block:
   0 }` was REMOVED rather than promoted into the media query, since WP-11 asked
   for no box-affecting override on the `.sec-how` root. The section keeps its
   normal shell padding and `.sec-how__inner` subtracts it:
   `min-block-size: calc(100vh - 2 * clamp(var(--sp-16), 12vh, var(--sp-32)))`.
   `#how` therefore still measures exactly one viewport tall, and the pinned
   block holds its content in view with symmetric breathing room above and
   below.

The caret in step 1 was also deleted. It was the only remaining element that
moved, at 0.000011 per entry, and it was decorative rather than copy. The prompt
still types out in mono, scrubbed by scroll.

## What was re-proved, not just assumed

Re-run in full after the restructure, same harness, same method:

```
=== 1440x900, reduced motion OFF ===
sec-how--staged present: true
ScrollTrigger total=1 pins=1 scrubs=1
ranges: [{"start":1563,"end":6063,"pinned":true}]
pin: {"start":1563,"end":6063,"distance":4500,"vh":900,"pinClass":"sec-how__inner"}
expected pinned distance 5 * vh = 4500
  p=0.0 y=1563 activeStep=0 visOn=0 typedChars=0 partsIn=0 innerTop=385
  p=0.1 y=2013 activeStep=0 visOn=0 typedChars=28 partsIn=0 innerTop=108
  p=0.2 y=2463 activeStep=0 visOn=0 typedChars=53 partsIn=0 innerTop=108
  p=0.3 y=2913 activeStep=1 visOn=1 typedChars=53 partsIn=2 innerTop=108
  p=0.4 y=3363 activeStep=1 visOn=1 typedChars=53 partsIn=3 innerTop=108
  p=0.5 y=3813 activeStep=2 visOn=2 typedChars=53 partsIn=3 innerTop=108
  p=0.6 y=4263 activeStep=2 visOn=2 typedChars=53 partsIn=3 innerTop=108
  p=0.7 y=4713 activeStep=3 visOn=3 typedChars=53 partsIn=6 innerTop=108
  p=0.8 y=5163 activeStep=3 visOn=3 typedChars=53 partsIn=7 innerTop=108
  p=0.9 y=5613 activeStep=4 visOn=4 typedChars=53 partsIn=9 innerTop=108
  p=1.0 y=6063 activeStep=4 visOn=4 typedChars=53 partsIn=10 innerTop=108
distinct active steps across the pinned range: [0,1,2,3,4]  ALL FIVE ADVANCE
pinned innerTop mid-range: [108]
active step colour / border at p=0.5: rgb(20, 23, 26) | 2px rgb(31, 107, 74)
inactive step colour / border: rgb(101, 110, 119) | rgb(226, 223, 217)

=== 900px, reduced motion OFF ===
ScrollTrigger total=0 pins=0 scrubs=0
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 375px, reduced motion OFF ===
ScrollTrigger total=0 pins=0 scrubs=0
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 1440px, reduced motion ON ===
ScrollTrigger total=0 pins=0 scrubs=0
html.no-motion: true
all five steps readable: true
elements at opacity 0 inside #how: 0

=== 375px, reduced motion ON ===
ScrollTrigger total=0 pins=0 scrubs=0
html.no-motion: true
all five steps readable: true
elements at opacity 0 inside #how: 0

console errors: 0
page errors / unhandled rejections: 0
```

The pinned distance is still 4500px against a 900px viewport, exactly five
viewport heights. `innerTop` now holds at 108px rather than 0, which is the
section's own top padding, and is the deliberate consequence of removing the
root padding override: `clamp(var(--sp-16), 12vh, var(--sp-32))` resolves to
108px at a 900px viewport, and the inner subtracts twice that from its
`min-block-size`, so the pinned block is centred in the viewport rather than
flush to its top edge.

`npx tsc --noEmit` clean. `npm run build` clean. The harness, the CLS script,
the probe and the verification script were all deleted. `main.ts`, `index.html`
and `responsive.css` were never touched. The preview server was started on port
5197 by this package and stopped by that one PID, nothing else.

## One observation for WP-11 and WP-15, not mine to fix

Under reduced motion the WHOLE-PAGE CLS is large and none of it is this section:
0.3552 at 901x900, 0.2797 at 1024x768, 0.2222 at 1440x900, 0.1875 at 1920x1080,
with `.sec-how` contributing 0.000000 at every one. At 1440x900 it is a single
entry of 0.2222 whose only source is `BODY`, so the whole document moves once.
That is page level, most likely the scroll driver or the header, and it does not
reproduce with motion allowed. Logged here rather than chased, since this
package owns neither file.
