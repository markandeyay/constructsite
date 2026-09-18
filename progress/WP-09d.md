# WP-09d: Section 04, What it builds

Claimed 2026-09-18T01:44:54Z.

Owns: `src/sections/outputs.ts` and the one delimited `WP-09d` block at the end
of `src/styles/sections.css`. Nothing else was touched.

---

## What shipped

Full-width `.container`, the shared section head, a five card responsive grid,
and one centred closing line.

Both layers from spec section 1.4 appear on every card, because the two layer
structure is the point of the section:

1. Plain-language layer: the market headline as an `<h3>` at `--t-h3`
   (`.card__title`), plus one sentence in `--ink-muted` (`.card__body`).
2. Technical layer: a native `<details>` / `<summary>` labelled
   `copy.outputs.detailsLabel`, expanding to the technical category names in
   mono. No hand rolled disclosure. The native element is focusable, toggles on
   Enter and Space, exposes its expanded state to the accessibility tree, and
   keeps its content reachable with no script at all.

All five cards ship, including the fifth, which is the platform story.

Section head per BUILD_CONTRACT C5: `copy.outputs.num` (`04`) marked
`aria-hidden="true"`, `copy.outputs.kicker`, and the `<h2>` carrying
`id="outputs-title"`, which the shell's `aria-labelledby` already points at.

Every user facing string comes from `copy.outputs`. This module writes none of
its own, which is also how it stays inside Appendix B: the categories are named
as capabilities of the platform and nothing more. No clinical implication, no
clearance claim, no claim that a generated design is a product.

## Decisions

1. **No `initScrub`, and none is exported.** The section has nothing to scrub:
   spec section 7.4 allows the card reveal and nothing else, and a reveal is a
   CSS transition driven by IntersectionObserver (spec section 6.2). Creating a
   ScrollTrigger outside the single `gsap.matchMedia()` block is the exact bug
   spec section 6.4 exists to prevent, so nothing here creates one. A cross-WP
   line tells WP-10 there is no `initOutputsScrub` to call.

2. **The reveal class sits on the grid item, never on the `.card`.** `.card`
   declares a 240ms transform transition for its hover lift, and `.reveal` /
   `.is-revealed` declare a 600ms transform transition for the 14px rise. On one
   element they would share a single transform and the later stylesheet would
   take the transition. A wrapper `<li>` separates them cleanly, the card hover
   stays exactly as WP-05 defined it, and no card specific animation was added.

3. **Grid spans, not a new grid.** WP-05's `.grid` is consumed as it is. Cards
   1 to 3 span 4 of the 12 columns, cards 4 and 5 span 6, which gives 3 then 2
   at desktop. At 900px the shared grid is 6 columns and every card spans 3, so
   2 across. At 600px the shared grid is one column and the span is cleared to
   `auto`, so 1 across. Only the 600 and 900 breakpoints appear, as literal px.

4. **The disclosure marker is the browser's own.** No icon, no invented glyph,
   no emoji. The native marker already tracks the open state and needs no
   string of this agent's writing.

5. **`role="list"` is restated on the `<ul>`.** `base.css` resets `list-style`,
   which removes implicit list semantics in some screen reader pairings.

6. **Title reveal** uses `revealWords(title, { staggerMs: 40 })` per spec
   section 5.5 and the WP-08 note. No opacity is written onto the title or its
   split children by this package, and no observer is attached to anything
   inside the split.

## Reduced motion, spec section 13.1 and the section 19 gate

Nothing here can sit at `opacity: 0` with reduced motion on. `reveal()` adds the
settled class synchronously in that mode, `.no-motion .reveal` in `base.css`
cancels the hidden state even if script never runs, `revealWords` never arms the
title, and this block writes no opacity of its own at all. The `<details>`
content stays reachable because the element is native.

## Gates, measured

`npx tsc --noEmit`: clean. `npm run build`: clean, zero TypeScript errors.

Playwright (the installed `playwright` package, Chromium) against a real
`vite preview` build of `dist/` at `http://localhost:4179/`:

```
================ 375x812 ================
PASS  five cards render  count=5
PASS  five h3 card headings  count=5
PASS  h2 carries id=outputs-title  id=outputs-title
PASS  decorative numeral aria-hidden  aria-hidden=true
PASS  grid rows  rows=[1,1,1,1,1] expected=[1,1,1,1,1]
PASS  five native details  count=5
PASS  details 1 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 2 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 3 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 4 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 5 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  zero console errors

================ 900x1200 ================
PASS  five cards render  count=5
PASS  five h3 card headings  count=5
PASS  h2 carries id=outputs-title  id=outputs-title
PASS  decorative numeral aria-hidden  aria-hidden=true
PASS  grid rows  rows=[2,2,1] expected=[2,2,1]
PASS  five native details  count=5
PASS  details 1 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 2 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 3 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 4 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 5 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  zero console errors

================ 1440x900 ================
PASS  five cards render  count=5
PASS  five h3 card headings  count=5
PASS  h2 carries id=outputs-title  id=outputs-title
PASS  decorative numeral aria-hidden  aria-hidden=true
PASS  grid rows  rows=[3,2] expected=[3,2]
PASS  five native details  count=5
PASS  details 1 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 2 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 3 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 4 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  details 5 keyboard open + exposed  focus=SUMMARY open=true visible=true inA11yTree=true
PASS  zero console errors

========= reduced motion 375x812 =========
PASS  no element at opacity 0 under reduced motion
PASS  details content reachable under reduced motion
PASS  zero console errors

========= reduced motion 900x1200 =========
PASS  no element at opacity 0 under reduced motion
PASS  details content reachable under reduced motion
PASS  zero console errors

========= reduced motion 1440x900 =========
PASS  no element at opacity 0 under reduced motion
PASS  details content reachable under reduced motion
PASS  zero console errors

FAILURES: 0
```

Method notes. Row shape is measured from the live bounding rects of the five
grid items, grouped by top offset, not from a CSS assertion. Each disclosure is
opened by focusing its `<summary>` and pressing Enter, and its content is
confirmed present in the rendered accessibility tree via `ariaSnapshot()`, not
merely visible. The reduced-motion sweep walks every node under `#outputs` and
reads computed opacity. Console errors and page errors were collected for the
whole of every run, including a full scroll sweep, and both counts are zero.

## Compliance

- No neon or two-hue gradient, no gradient of any kind, no glow, no colored
  shadow, no glassmorphism, no `backdrop-filter`, no imagery, no helix art, no
  emoji, no icon, no particle field, no custom cursor, no marquee.
- No em dash anywhere in either file. No personal name. No forbidden product or
  company name.
- Max specificity in the block is (0,2,0). No importance flag, no negation
  pseudo class chain, no bare element selector, no token definition.
- Breakpoints used: 600 and 900 only, as literal px.
- Brace balance verified: 15 open, 15 close inside the delimited block.
- The block sits at the end of the file behind its own delimiters. No other
  block was read from, edited, reordered or reformatted.
