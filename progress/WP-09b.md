# WP-09b: Section 02, The problem

Claimed 2026-09-18T02:10:00Z. Done 2026-09-18T02:34:00Z.

Owns: `src/sections/problem.ts`, and one delimited block at the end of
`src/styles/sections.css` (`/* ==== WP-09b: Problem ==== */`). Nothing else was
touched. WP-01's stub at `src/sections/problem.ts` was overwritten wholesale.

---

## 1. THE STAT ROW IS DELETED. NO NUMBER WAS INVENTED.

Spec section 7.2 describes a three item stat row below the prose, with large
mono numerals counting up on enter via `fx/counter.ts`. **That stat row does not
exist in this section and never did.**

BUILD_CONTRACT override **A6 Q3** resolves spec section 20 Q3: the owner has
confirmed that no verified statistics about the time or cost of manual design
exist, so section 02 ships as **prose only** and the stat row is deleted
entirely. Spec section 7.2 itself gives the same instruction in its own warning
block, and Appendix B forbids inventing a number, a user count, a partnership or
a clinical status.

Concretely, in this section:

- `fx/counter.ts` is not imported and `countUp` is never called. Per A6 Q3 the
  module still exists in the repo and stays exported; it is simply unused here.
- No element carries a stat, figure, metric or numeral class. The Playwright run
  below asserts `[class*="stat"]` matches zero elements in `#problem`, at all
  three viewports and in both motion modes.
- **The only numeral anywhere in the section is the decorative `02`** in
  `.sec-head__num`, which carries `aria-hidden="true"` per spec section 13.2.
  The run below walks every text node in `#problem` and asserts that every node
  containing a digit is inside that one span. It returned an empty list of stray
  digits at every viewport.
- No number was invented, estimated, rounded, illustrated or placed behind a
  "TBD" comment. There is nothing here for a later agent to fill in.

## 2. What ships

Layout, spec section 7.2: `.container.container--narrow` (720px, centred), the
BUILD_CONTRACT C5 section head, then two paragraphs in `.prose` (34em measure).

Markup, in order:

```
section#problem.sec-problem
  div.container.container--narrow
    header.sec-head
      span.sec-head__num[aria-hidden=true]   copy.problem.num      "02"
      span.sec-head__kicker                  copy.problem.kicker   "THE COST"
      h2#problem-title.sec-head__title       copy.problem.title
      hr.sec-head__rule
    div.prose.sec-problem__prose
      p.sec-problem__para.reveal             copy.problem.body1
      p.sec-problem__para.reveal             copy.problem.body2
```

`id="problem-title"` matches the `aria-labelledby="problem-title"` that WP-01
already put on the shell. Every string comes from `copy.ts`. This package wrote
no user facing string of its own.

## 3. Motion, spec section 5.5

All four beats are CSS transitions toggled by `.is-revealed` from
`core/observe.ts` (spec section 6.2). No GSAP tween, no ScrollTrigger.

1. The rule draws left to right, 900ms `--ez-out-expo`. That rule lives in
   WP-05's `layout.css` keyed off `.sec-head.is-revealed .sec-head__rule`; this
   package only had to emit the `<hr class="sec-head__rule">` and put
   `.is-revealed` on the `.sec-head` itself, which one `reveal(head)` does.
2. The numeral and kicker fade up, 60ms stagger. Same source, same single call.
3. The title reveals per word, 40ms stagger, clip mask from below, via
   `revealWords(title, { staggerMs: 40 })` from `fx/splitText.ts`, coded against
   the frozen C9 signature.
4. The paragraphs reveal on enter: `reveal(p1)` and `reveal(p2, { delay: 70 })`.

**No `initScrub` is exported.** A prose section has nothing to scrub, so this
module creates no ScrollTrigger and gives WP-10 nothing to call. Spec section
6.4's `initProblemScrub()` line has no counterpart here by design, and WP-10
should simply omit section 02 from the `matchMedia` block. Creating a trigger
anywhere outside that block is the exact bug spec section 6.4 exists to prevent.

## 4. Reduced motion, made structural

Three independent layers, so no element in this section can sit at `opacity: 0`:

1. `core/observe.ts#reveal` adds the settled class **synchronously** when
   reduced motion is on: no observer, no timer, no transition.
2. `fx/splitText.ts#revealWords` never adds `.fx-split--armed` in that mode, so
   the hidden word state is never applied to the title.
3. This package's own block adds `.no-motion .sec-problem__para` and a
   `@media (prefers-reduced-motion: reduce)` rule forcing `opacity: 1`,
   `transform: none`, `transition: none`, whatever class ended up on the node.

Layers 1 and 2 belong to other packages, which is why layer 3 exists here.

## 5. CSS block

One block, appended at the END of `sections.css`, opened
`/* ==== WP-09b: Problem ==== */` and closed `/* ==== /WP-09b ==== */`. Every
selector is prefixed `.sec-problem`. Highest specificity used is (0,2,0)
(`.no-motion .sec-problem__para` and `.sec-problem .sec-problem__para`). No
`!important`, no `:not()` chain, no bare element selector, no token definition,
no utility class, no global override. The only breakpoint used is a literal
`600px`. Verified by grep over the block.

Nothing from spec section 2.4 appears: no gradient of any kind, no glow, no
colored shadow, no `backdrop-filter`, no image, no emoji, no particle field, no
custom cursor, no marquee.

## 6. Gates, measured

```
npx tsc --noEmit          clean, exit 0
npm run build             clean, exit 0
                          dist/assets/index-*.css  18.49 kB  gzip 4.39 kB
                          dist/assets/index-*.js  149.32 kB  gzip 55.98 kB
```

Playwright (the installed `playwright` package, Chromium) against a real
`npx vite preview` build at `http://localhost:4173/`, three viewports, both
motion modes, after a full scroll sweep. Measured output:

```
--- [no-preference 375px] ---
PASS  section #problem renders
      section class: sec-problem
      aria-labelledby=problem-title title id=problem-title
      num="02" aria-hidden=true kicker="THE COST"
      title="Design is the bottleneck."
      rule present=true transform=matrix(1, 0, 0, 1, 0, 0)
      paragraphs=2 prose width=335px para width=335px font-size=16px 34em=544px
      section height=671px stat-row elements=0
PASS  root class sec-problem
PASS  title id wired to aria-labelledby
PASS  numeral aria-hidden
PASS  sec-head__rule present
PASS  two paragraphs  2
PASS  prose holds 34em measure  335 <= 544
PASS  no stat row element  0
PASS  no numeral other than the decorative 02  []
PASS  decorative numeral is 02  02
      (opacity 0 nodes with motion on, after reveal: 0)
PASS  zero console errors  []
PASS  zero unhandled rejections  []

--- [no-preference 900px] ---
      paragraphs=2 prose width=544px para width=544px font-size=16px 34em=544px
      section height=614px stat-row elements=0
PASS  prose holds 34em measure  544 <= 544
PASS  no stat row element  0
PASS  no numeral other than the decorative 02  []
PASS  zero console errors  []
PASS  zero unhandled rejections  []

--- [no-preference 1440px] ---
      paragraphs=2 prose width=544px para width=544px font-size=16px 34em=544px
      section height=595px stat-row elements=0
PASS  prose holds 34em measure  544 <= 544
PASS  no stat row element  0
PASS  no numeral other than the decorative 02  []
PASS  zero console errors  []
PASS  zero unhandled rejections  []

--- [reduce 375px] ---
      paragraphs=2 prose width=335px para width=335px font-size=16px 34em=544px
      section height=671px stat-row elements=0
PASS  nothing at opacity 0 under reduced motion  []
PASS  no numeral other than the decorative 02  []
PASS  zero console errors  []
PASS  zero unhandled rejections  []

--- [reduce 900px] ---
      paragraphs=2 prose width=544px para width=544px font-size=16px 34em=544px
      section height=614px stat-row elements=0
PASS  nothing at opacity 0 under reduced motion  []
PASS  no numeral other than the decorative 02  []
PASS  zero console errors  []
PASS  zero unhandled rejections  []

--- [reduce 1440px] ---
      paragraphs=2 prose width=544px para width=544px font-size=16px 34em=544px
      section height=595px stat-row elements=0
PASS  nothing at opacity 0 under reduced motion  []
PASS  no numeral other than the decorative 02  []
PASS  zero console errors  []
PASS  zero unhandled rejections  []

ALL CHECKS PASSED
```

The measure check is the real one: the paragraph box is 544px at 900 and 1440,
and 16px font size puts 34em at exactly 544px, so the prose is sitting on its
specified limit rather than near it. At 375px the gutter binds first at 335px.

Two further measurements taken by hand at 1440px:

- The split title's accessible layer (`.fx-split__sr`) measures 1x1px with
  `position: absolute; clip-path: inset(50%)`, and the visual layer measures
  567x59px and carries `aria-hidden="true"`. The heading therefore renders once
  on screen and reads once to assistive technology, despite `textContent`
  returning the string twice.
- A rendered screenshot at 1440px confirms the section is head plus two
  paragraphs and nothing else: no stat row, no numerals, no decoration.

## 7. Constraint sweep over the two owned files

- No em dash (U+2014). Verified by grep.
- No emoji, no personal name, no `PMR`, no `PlasmidAI`. Verified by grep.
- No user facing string authored here; every word comes from `copy.ts`.
- No `npm install`, no `package.json` edit, no git, no vercel, no `main.ts`,
  no `index.html`.

## 8. Notes for later packages

- WP-10: section 02 exports no `initScrub`. Nothing to call.
- WP-11: the only breakpoint this block uses is 600px, for the space between the
  head and the prose. The 34em measure needs no responsive override.
- WP-14: the section's contrast pairs are `--ink-faint` on `--paper` (numeral),
  `--ink-muted` on `--paper` (kicker and body) and `--ink` on `--paper` (title).
  All three come from WP-05 classes, not from this block.
