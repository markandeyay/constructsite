# WP-09e: Section 05, Validation

Claimed 2026-09-18T02:30:00Z. Done 2026-09-18T02:55:00Z.

Owns: `src/sections/validation.ts`, `public/data/demo-validation.json`, and one
delimited `/* ==== WP-09e ==== */` block at the end of `src/styles/sections.css`.
Nothing else was touched. `main.ts` and `index.html` were not edited.

---

## 1. What shipped

Spec section 7.5 as written, with override A6 Q2 and Q10 applied.

- Section head per BUILD_CONTRACT C5: `copy.validation.num` (`05`) as a
  decorative `aria-hidden` numeral, the kicker, `copy.validation.title` carrying
  `id="validation-title"` (the shell's `aria-labelledby` already points there),
  and the hairline rule. The title reveals per word through
  `revealWords(title, { staggerMs: 40 })`. No rule in the WP-09e CSS block sets
  an opacity on `.sec-head__title` or on anything WP-08 owns.
- LEFT column: `body1`, `body2`, `body3` inside `.prose`, which carries the 34em
  measure from WP-05.
- RIGHT column: the validation report panel, four rows, rendered from the baked
  JSON. Row labels come from `copy.validation.rows`, the PASS and WARN words
  from `copy.validation.pass` and `copy.validation.warn`, the reason string from
  the JSON. Mono, `tabular-nums`, with `--pass` and `--warn` swatches.
- BELOW both columns: the full-width gold-set strip carrying
  `copy.validation.goldset` as ONE intact string, in one text node, never split
  per word and never reformatted.

Two columns at `min-width: 901px`; one column below that. Breakpoints used are
600 and 901 only, written as literal px.

`initScrub` is NOT exported. A report panel has nothing to scrub, and spec
section 6.4 allows triggers to be created in one place only.

## 2. Appendix B check

Every user-facing string in this section comes from `copy.ts` verbatim. This
package wrote no claim of its own. The only strings it authored are the JSON
reason string and the `_TODO` note, which are data, not copy.

| Appendix B row | How this section stands |
|---|---|
| Validation accuracy | `copy.validation.goldset` renders as one unbroken string: `36 known-good · 52 known-bad · 100% combined accuracy on the curated set`. Measured in the built page, "curated" sits 30 characters from "100%", inside the 60-character window the section 16.5 lint enforces. The strip is not split per word, not re-wrapped into separate elements, and no CSS rule in the WP-09e block can put the number and its qualifier into different text nodes. |
| Determinism | Rendered only through `copy.validation.body2`, which says the engine follows fixed rules and that the same design always produces the same verdict. Nothing here extends the word to imply the biology is settled, and the words "guaranteed", "provably" and "correct" appear nowhere in the section. Spec section 1.3's scoping holds. |
| Wet lab | Nothing in this section mentions a lab, an experiment, or a result obtained from one. |
| Product status | No user count, no deployment claim, no number of any kind beyond the two gold-set counts that Appendix B itself approves. |
| Output breadth | Not touched by this section. |
| Biosecurity (B.1) | **No line rendered.** Override A6 Q10 omits it, `copy.ts` carries no `biosec` key, and this module renders no safety, screening, clinical or regulatory-status claim of any kind. A false safety claim is the one category of overstatement that does not get forgiven, so this was checked by grep as well as by eye. |

Colour is never the only signal (spec section 13.4): every row carries the PASS
or WARN word as text, and the SVG swatch is `aria-hidden` and decorative. There
is no tick-mark emoji and no glyph used as a pass symbol; the mark is an SVG
rect (spec section 2.4).

## 3. Placeholder status (override A6 Q2)

`public/data/demo-validation.json` is a **PLACEHOLDER**. No real export from a
product run was available at build time, and spec section 7.5 is explicit that
invented validation output must not be presented as product output. The file
therefore carries a literal `"_TODO"` key whose value states plainly that it is
placeholder data to be replaced with a real export.

The key is a key, not a `//` comment, because JSON has no comment syntax and a
comment line would make `fetch().json()` throw.

While the key is present, `loadReport()` prints a console **WARNING** naming the
file, the key and the note. It is a warning and never an error, because spec
section 16.6 makes console errors a hard build gate and a known, logged
placeholder must not fail that gate. A line is recorded under `## Blocked` in
`PROGRESS.md`.

**To replace it:** drop in a real export with the same shape, then delete the
`_TODO` key. The warning disappears on its own.

```json
{
  "construct": "<name>",
  "checks": [
    { "id": "restriction-site-conflicts",   "status": "PASS" },
    { "id": "repeat-synthesis-instability", "status": "PASS" },
    { "id": "codon-usage-fit",              "status": "PASS" },
    { "id": "regulatory-compatibility",     "status": "WARN", "reason": "<short data string>" }
  ]
}
```

`checks` maps to `copy.validation.rows` by index. `status` is `PASS` or `WARN`.
`reason` is optional and is rendered only when present. The reason strings are
DATA (spec section 11.11) and must never move into `copy.ts`.

## 4. Decisions

1. **Labels render before the data arrives.** `mount` builds all four rows with
   their labels from `copy.ts` synchronously, then fills the status cells from
   the payload. If the fetch ever fails the panel degrades to four labelled rows
   rather than to nothing, and the failure is logged as a warning (never an
   error) through a `.catch`, so there is no unhandled rejection.
2. **The swatch is an SVG rect, not a CSS pseudo-element.** Spec section 2.4
   bans a tick-mark emoji as a pass symbol and says to draw any pass mark as an
   SVG or a text label. Both are used: the SVG square and the PASS/WARN word.
3. **The gold-set line is one text node.** Splitting it on the middle dots would
   put the number and its qualifier into separate elements. Rendered intact, and
   revealed as a whole rather than per word.
4. **Motion.** `revealGroup(rowLabels, 110)` gives the spec's 110ms row stagger.
   Each status mark then reveals at `i * 110 + 180`, so a row's mark draws in
   after its own label. All of it is CSS transitions toggled by
   IntersectionObserver (spec section 6.2), zero GSAP.
5. **Reduced motion is structural.** `core/observe.ts` settles synchronously and
   `revealGroup` collapses its stagger to zero when reduced motion is on, and
   the CSS block adds a third backstop under both `.no-motion` and the media
   query for every element this section owns.
6. **No observer on `.fx-split__inner`.** The only split element here is the
   section title, handled entirely by `revealWords`.

## 5. Gates, measured

`npx tsc --noEmit` clean. `npm run build` clean (zero TypeScript errors, zero
build errors).

Playwright, Chromium, against a real `vite preview` build at
`http://localhost:4173/`, at 375x812, 900x1200 and 1440x900, each viewport run
twice: normal and `prefers-reduced-motion: reduce`. Full scroll sweep with real
wheel events so Lenis drives the scroll rather than fighting it. Measured
output:

```
--- 375px normal ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

--- 375px reduced-motion ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

--- 900px normal ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

--- 900px reduced-motion ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

--- 1440px normal ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

--- 1440px reduced-motion ---
rows=4
  [RESTRICTION SITE CONFLICTS] -> "PASS"
  [REPEAT / SYNTHESIS INSTABILITY] -> "PASS"
  [CODON USAGE FIT] -> "PASS"
  [REGULATORY COMPATIBILITY] -> "WARN" reason="intentional dual-promoter architecture"
goldset="36 known-good · 52 known-bad · 100% combined accuracy on the curated set" distance(100%,curated)=30
validation _TODO warnings=1 validation console errors=0
opacity-0 elements in #validation = 0
console errors=0 unhandled rejections=0

ALL CHECKS PASSED
```

Read back: four rows render with their text status labels at every viewport; the
gold-set strip renders with "curated" 30 characters from "100%"; the `_TODO`
console warning fires exactly once per load, as a warning, with zero console
errors from this section; nothing in `#validation` sits at opacity 0 under
reduced motion (or, after the sweep, under normal motion either); zero console
errors and zero unhandled rejections across every run.

## 6. Constraint compliance

- No em dash in any file this package wrote.
- No emoji, no tick-mark emoji as a pass symbol, no neon or two-hue gradient, no
  glow, no colored `box-shadow`, no `backdrop-filter`, no glassmorphism, no
  marquee, no custom cursor, no stock imagery. The section has no image at all.
- No personal name, no `PMR`, no `PlasmidAI` anywhere in these files.
- No `!important`, no `:not()` styling chain, no bare element selector, no token
  definition in the CSS block. Max specificity (0,2,0).
- Every selector in the block is prefixed `.sec-validation`. No other block in
  `sections.css` was read into, edited, reordered or reformatted.
- No user-facing string was authored here beyond the JSON reason string and the
  `_TODO` note, both of which are data.
