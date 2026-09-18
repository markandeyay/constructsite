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
