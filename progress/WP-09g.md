# WP-09g: Section 07, Where we are (Traction)

Claimed 2026-09-18T02:40:00Z. Done 2026-09-18T03:05:00Z.

Owns exactly two things: `src/sections/traction.ts` (WP-01's stub overwritten
wholesale) and ONE delimited block at the end of `src/styles/sections.css`,
opened `/* ==== WP-09g: Traction ==== */` and closed `/* ==== /WP-09g ==== */`.
Nothing else in the repo was edited except the two single appended lines in
`PROGRESS.md`.

## What shipped

Section head per BUILD_CONTRACT C5: `.sec-head` holding the decorative numeral
(`copy.traction.num`, `aria-hidden="true"`), the kicker, the `h2` carrying
`id="traction-title"` to match the shell's `aria-labelledby`, and the rule.

Then four items from `copy.traction.items`, each a display serif `h3` plus one
line of `--ink-muted` body in a `p`. Four in a row at desktop, two by two at
tablet, stacked at mobile, all three achieved with WP-05's shared `.grid`
(12 columns, 6 below 900px, 1 below 600px) and a span of 3.

`mount(root)` only. No `initScrub` is exported: four text items have nothing to
scrub, and creating a ScrollTrigger outside the single `gsap.matchMedia()`
block in `main.ts` is the exact bug spec section 6.4 exists to prevent. WP-10
must not import or call one from this module.

## THE TRUTH GATES

**NO LOGO IS DISPLAYED.** This section is text only. There is no `<img>`, no
`<svg>`, no `<picture>`, no `<canvas>`, no `<iframe>`, no icon font, no
`background-image` and no pseudo element glyph anywhere in the module or in its
CSS block. Override A6 Q4 records that there is no written permission to
display the Addgene wordmark or mark, so the markup deliberately gives a mark
nowhere to live. Measured in the built page at all three viewports: 0 image or
vector elements and 0 CSS background images inside `#traction`. Spec section 19
checkbox "No logo is displayed without permission to display it" holds for this
section.

**NO ICONS.** Spec section 7.7 bans them outright. Same measurement covers it.

**THE BANNED WORDS ARE ABSENT.** The word "partnered" (override A6 Q4) and the
phrase "trained on" (override A6 Q9) do not appear in the rendered text or in
the rendered HTML of this section, measured at 375, 900 and 1440 px, with and
without reduced motion. They also do not appear in this module's source, not
even in a comment: the comment that explains their absence refers to them by
override number instead, so a repo wide grep stays clean. A grep of the built
`dist/assets/*.js` returns 0 hits for both.

**THE ACCURACY QUALIFIER SURVIVES.** Measured in the built page: the rendered
string beginning at "100%" reads

```
100% combined accuracy across a curated gold set of known-good a
```

so "curated" sits 29 characters after the "100%", well inside the 60 character
window the section 16.5 lint enforces.

**NO STRING WAS AUTHORED HERE.** Every user facing string is rendered verbatim
from `copy.traction`. No heading was rewritten, no connecting phrase added, no
subtitle invented, no commit count, user count, lab count, funding fact,
clinical status or any other number introduced. Appendix B compliance for these
strings was established by WP-04's documented row by row walk in
`progress/WP-04.md`, and this module preserves it by rendering text nodes and
nothing else. The four items render as intact strings, never split or
fragmented, so the Addgene data source wording and the gold set figure stay
verifiable in the built page.

## Motion, spec sections 5.5 and 6.2

- One `reveal()` on `.sec-head`, which drives the rule drawing left to right at
  900ms and the numeral and kicker fading up at a 60ms stagger. Both beats are
  WP-05 rules keyed off `.sec-head.is-revealed`; nothing here redefines them.
- `revealWords(title, { staggerMs: 40 })` for the per word title reveal. WP-08
  owns that element's opacity; this block writes none, and the observer lands on
  the clip boxes `splitWords` returns, never on `.fx-split__inner`.
- `revealGroup(items, 70)` for the four items.
- All CSS transitions toggled by IntersectionObserver. Zero GSAP tweens, zero
  ScrollTriggers created in this module.

## Reduced motion, spec section 13.1 and the section 19 gate

Four independent layers, so this is structural rather than lucky: every element
is readable with no class on it at all, `reveal()` adds the settled class
synchronously when reduced motion is on, `.no-motion .reveal` in `base.css`
cancels the hidden state even with no script, and this block adds a third
backstop under both `.no-motion .sec-traction__item` and
`@media (prefers-reduced-motion: reduce)`. `revealWords` never arms the title
in that mode. Measured: zero elements at `opacity: 0` or `visibility: hidden`
inside `#traction` at all three viewports under emulated reduced motion.

## CSS block discipline

One block, appended at the end of the file, never touching another block. Every
selector prefixed `.sec-traction`. Maximum specificity used is (0,2,0)
(`.sec-traction .sec-traction__item`, inside the reduced motion media query).
No `!important`, no `:not()` chain, no bare element selector, no bare `img`
selector, no token definition. Breakpoints used are 600 and 900 as literal px,
which are two of the four in spec section 5.4. No gradient of any kind, no
glow, no coloured shadow, no `backdrop-filter`, no marquee, no custom cursor,
no particle field, no emoji, no em dash.

The one override that had to exist: below 600px the shared `.grid` is a single
column, where `grid-column: span 3` would create implicit columns, so the item
is reset to `grid-column: auto`.

## GATES

`npx tsc --noEmit`: clean, no output.
`npm run build`: clean. Only warning is Vite's pre-existing 500 kB chunk note,
which is the seqviz and React weight spec section 12 already budgets for.

### Playwright verification

Real Chromium against a real `vite preview` build of the current `dist`, at
375x812, 900x1200 and 1440x900, each viewport run twice: once with
`reducedMotion: 'no-preference'` and once with `'reduce'`. Every run performs a
full scroll sweep so the observers fire, then measures the live DOM. Row and
column counts are taken from `offsetTop` / `offsetLeft`, which are layout
positions and therefore immune to a reveal's in-flight translate.

```
PASS  [375px] #traction section exists
PASS  [375px] four items render (got 4)
PASS  [375px] stacked at mobile (rows=4 cols=1 widths=335,335,335,335)
PASS  [375px] no img/svg/canvas/iframe in the section (got 0)
PASS  [375px] no CSS background-image in the section (got 0)
PASS  [375px] the word "partnered" is absent
PASS  [375px] the phrase "trained on" is absent
PASS  [375px] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [375px] h2 carries id="traction-title"
PASS  [375px] decorative numeral is aria-hidden
PASS  [375px] heading order: 1 h2, 4 h3
PASS  [375px] zero console errors / unhandled rejections (none)
PASS  [375px reduced] #traction section exists
PASS  [375px reduced] four items render (got 4)
PASS  [375px reduced] stacked at mobile (rows=4 cols=1 widths=335,335,335,335)
PASS  [375px reduced] no img/svg/canvas/iframe in the section (got 0)
PASS  [375px reduced] no CSS background-image in the section (got 0)
PASS  [375px reduced] the word "partnered" is absent
PASS  [375px reduced] the phrase "trained on" is absent
PASS  [375px reduced] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [375px reduced] h2 carries id="traction-title"
PASS  [375px reduced] decorative numeral is aria-hidden
PASS  [375px reduced] heading order: 1 h2, 4 h3
PASS  [375px reduced] nothing at opacity 0 (none)
PASS  [375px reduced] zero console errors / unhandled rejections (none)
PASS  [900px] #traction section exists
PASS  [900px] four items render (got 4)
PASS  [900px] 2x2 at tablet (rows=2 cols=2 widths=402,402,402,402)
PASS  [900px] no img/svg/canvas/iframe in the section (got 0)
PASS  [900px] no CSS background-image in the section (got 0)
PASS  [900px] the word "partnered" is absent
PASS  [900px] the phrase "trained on" is absent
PASS  [900px] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [900px] h2 carries id="traction-title"
PASS  [900px] decorative numeral is aria-hidden
PASS  [900px] heading order: 1 h2, 4 h3
PASS  [900px] zero console errors / unhandled rejections (none)
PASS  [900px reduced] #traction section exists
PASS  [900px reduced] four items render (got 4)
PASS  [900px reduced] 2x2 at tablet (rows=2 cols=2 widths=402,402,402,402)
PASS  [900px reduced] no img/svg/canvas/iframe in the section (got 0)
PASS  [900px reduced] no CSS background-image in the section (got 0)
PASS  [900px reduced] the word "partnered" is absent
PASS  [900px reduced] the phrase "trained on" is absent
PASS  [900px reduced] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [900px reduced] h2 carries id="traction-title"
PASS  [900px reduced] decorative numeral is aria-hidden
PASS  [900px reduced] heading order: 1 h2, 4 h3
PASS  [900px reduced] nothing at opacity 0 (none)
PASS  [900px reduced] zero console errors / unhandled rejections (none)
PASS  [1440px] #traction section exists
PASS  [1440px] four items render (got 4)
PASS  [1440px] four in a row at desktop (rows=1 cols=4 widths=258,258,258,258)
PASS  [1440px] no img/svg/canvas/iframe in the section (got 0)
PASS  [1440px] no CSS background-image in the section (got 0)
PASS  [1440px] the word "partnered" is absent
PASS  [1440px] the phrase "trained on" is absent
PASS  [1440px] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [1440px] h2 carries id="traction-title"
PASS  [1440px] decorative numeral is aria-hidden
PASS  [1440px] heading order: 1 h2, 4 h3
      headings: ["Live today","Grounded in real data","Open","Validated"]
      bodies:   ["The full pipeline runs end to end. Describe, retrieve, generate, validate, export.","Built on Addgene's plasmid repository, the field's most comprehensive dataset, which is the corpus our retrieval runs against.","MIT licensed and public on GitHub, so the engine can be read, not just described.","100% combined accuracy across a curated gold set of known-good and known-bad constructs."]
      heading font-family: "Instrument Serif", Georgia, "Times New Roman", serif
      body color: rgb(92, 101, 112)
PASS  [1440px] zero console errors / unhandled rejections (none)
PASS  [1440px reduced] #traction section exists
PASS  [1440px reduced] four items render (got 4)
PASS  [1440px reduced] four in a row at desktop (rows=1 cols=4 widths=258,258,258,258)
PASS  [1440px reduced] no img/svg/canvas/iframe in the section (got 0)
PASS  [1440px reduced] no CSS background-image in the section (got 0)
PASS  [1440px reduced] the word "partnered" is absent
PASS  [1440px reduced] the phrase "trained on" is absent
PASS  [1440px reduced] "100%" sits within 60 chars of "curated": "100% combined accuracy across a curated gold set of known-good a"
PASS  [1440px reduced] h2 carries id="traction-title"
PASS  [1440px reduced] decorative numeral is aria-hidden
PASS  [1440px reduced] heading order: 1 h2, 4 h3
PASS  [1440px reduced] nothing at opacity 0 (none)
PASS  [1440px reduced] zero console errors / unhandled rejections (none)

WP-09g VERIFY: PASS (0 failures)
```

76 assertions, 0 failures.

## Cross-WP note

`src/sections/traction.ts` exports `mount` only. Spec section 6.4's example
matchMedia block lists an `initTractionScrub()`; there is nothing in this
section to scrub, so no such export exists and WP-10 must not call one.

## Two-line summary

Built section 07 as four text only items rendered verbatim from
`copy.traction`, with the section head, the per word title reveal and a
staggered item reveal, plus one delimited `.sec-traction` block in
`sections.css`.
No logo, no icon, no image of any kind is rendered, and the words "partnered"
and "trained on" are absent from the source, the rendered page and the built
bundle, verified in Chromium at three viewports with and without reduced
motion.
