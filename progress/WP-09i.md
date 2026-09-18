# WP-09i: Header and Footer

Claimed 2026-09-18T03:05:00Z. Done 2026-09-18T03:40:00Z.

Owns: `src/sections/header.ts`, `src/sections/footer.ts`. Nothing else.
No block in `sections.css`: header and footer styles are shared chrome and
already live in WP-05's `components.css`. `layout.css`, `components.css`,
`main.ts` and `index.html` were not touched.

---

## 1. What shipped

### `src/sections/header.ts`

Spec 7.0, class names frozen by contract C5. `mount(root)` adds `site-header`
to the `<header id="site-header">` shell and builds, in this order:

1. `.skip-link` to `#main`, label `copy.header.skip`, as the FIRST child of the
   first element in `<body>`, so it is the first focusable element on the page
   (spec 13.2). It keeps its native jump on purpose: routing it through Lenis
   would scroll the page but never move focus into `<main>`. Verified below:
   after activating it, the next Tab lands on the hero CTA inside `<main>`,
   not back in the header nav.
2. `.site-header__inner` holding the wordmark and the nav.
3. `.site-header__wordmark`, an anchor to `#hero`, text `copy.header.wordmark`
   set in the display serif at 20px by `components.css`. Not a logo image.
4. `<nav class="site-header__nav">` with `copy.header.nav1` to `#how`,
   `copy.header.nav2` to `#outputs`, `copy.header.nav3` to `#contact`, and the
   ghost button `copy.header.ghost` to `GITHUB_URL`
   (`.btn .btn--ghost .site-header__cta`, `target="_blank"`,
   `rel="noopener noreferrer"`).
5. The Contact anchor carries `.site-header__link--contact`, the standing
   WP-05 request. Without it the 720px collapse rule in `components.css` hides
   every nav link and no link at all renders on mobile. Verified at 375px:
   exactly one nav link shows, and it is Contact.

Behaviour:

- One `onScroll` subscriber from `core/scroll.ts`. No raw scroll listener, no
  second Lenis instance, no ScrollTrigger configuration.
- `.site-header--bordered` past 40px, `.site-header--hidden` past 400px on
  scroll down and removed on scroll up. Both states are held in a local
  boolean and `classList` is written ONLY when the boolean flips, per spec
  12.1. Measured: 1 class mutation across a 60 step scroll sweep spanning 76 to
  84 animation frames, at all three viewports.
- Anchor navigation is intercepted and handed to
  `scrollToTarget(target, -80)`. The real `href` stays on every anchor, so the
  links still work with JavaScript off and `qa/links.mjs` can resolve them.
  Modified clicks (middle click, ctrl, meta, shift, alt) and a click another
  handler already consumed are left alone.

### `src/sections/footer.ts`

Spec 7.10 as amended by overrides A1 and A4. `mount(root)` adds `site-footer`
to the `<footer id="site-footer">` shell, whose single hairline rule above is
the `border-top: 1px solid var(--rule)` already in `components.css`.

- Left: `<p class="site-footer__left">` holding `copy.footer.left`, which is
  `Construct. Chapel Hill, NC.` There is no other company name on the site.
- Right: `.site-footer__right` is a flex row with a gap, so `copy.footer.right`
  is split on its middle dot separator and each part becomes its own child.
  The part containing `github` becomes the anchor to `GITHUB_URL`; the year
  stays plain text. No string is authored in this package.
- No email address, no `mailto:`, no newsletter, no social icons. Verified
  against the whole rendered page, markup and visible text, at all three
  viewports: zero `mailto:` occurrences and zero strings matching an email
  address pattern.

## 2. Decisions

1. **The nav's accessible name.** Spec 13.2 wants the nav named, and the
   constraint for this package is to author no user-facing string. `copy.ts`
   has no key for a nav label and contract C3 freezes the `copy.header` shape,
   so the nav takes `aria-labelledby` pointing at the wordmark anchor and is
   announced as "Construct". A cross-WP request to WP-04 is logged for a
   `header.navLabel` key if that shape is ever reopened.
2. **The wordmark is an anchor to `#hero`.** `components.css` styles
   `.site-header__wordmark` with `text-decoration: none` and a
   `:focus-visible` outline, which only makes sense on a focusable element. It
   is routed through Lenis like the nav links, and `#hero` exists, so
   `qa/links.mjs` resolves it.
3. **The skip link is not routed through Lenis.** See above: focus movement is
   the entire point of a skip link, and only the native jump provides it.
4. **No CSS was written.** Every class this markup uses already exists in
   `components.css` or `layout.css`.

## 3. Cross-WP request raised

`scrollToTarget(el, -80)` overshoots under Lenis. Lenis already subtracts the
element's `scroll-margin-top`, which spec 4.0 sets to 80px on every shell, so
the explicit -80 is applied a second time and the target lands 160px below the
viewport top instead of 80px. It is clear of the 64px header either way, which
is what spec 7.0 asks for, so nothing is broken and this package ships the call
the spec prescribes. Measured both paths at 1440px:

- motion allowed (Lenis installed): target top 160px
- reduced motion (`no-motion`, native fallback): target top 80px, exactly right

The fix belongs in `core/scroll.ts`, which WP-03 owns: subtract the resolved
`scroll-margin-top` from the offset before handing it to Lenis, so both drivers
land identically. Logged under `## Cross-WP requests`.

## 4. Gates

- `npx tsc --noEmit`: clean, exit 0.
- `npm run build`: clean. The only warnings are the pre-existing 3Dmol `eval`
  notice and the chunk-size notice, neither from this package.
- No em dash, no emoji, no personal name, no `PMR`, no `PlasmidAI` in either
  file. No glassmorphism, no `backdrop-filter`, no gradient, no glow, no
  hamburger, no drawer, no social icon, no marquee. Header background measured
  as fully opaque `rgb(250, 249, 247)` with `backdrop-filter: none`, and the
  header measured at exactly 64px tall.

## 5. Verification

Playwright, Chromium, against a real `npm run build` plus `vite preview` on
`http://localhost:4173/`, at 375x812, 900x1200 and 1440x900. The run script is
not a deliverable of this package and was not left in `qa/`, which WP-16 owns.

Note on the two `SKIP` lines at 375px: below 720px the `How it works` and
`What it builds` links are correctly display:none, so there is no link to
click. That collapse is asserted separately by the "below 720px only Contact
shows" check.

Note on the hide-on-scroll check: the header hide threshold is 400px and the
page is taller than that at every viewport, so no test spacer was needed; the
script only injects one if the document is too short, and it did not fire.

```
---- viewport 375x812 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
SKIP  nav click #how (link hidden at this width)
SKIP  nav click #outputs (link hidden at this width)
PASS  nav click #contact lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=1079px
PASS  header returns on scroll up  y=721px
PASS  classList not written every scroll frame  1 class mutations over 84 frames of a 60 step sweep
PASS  below 720px only Contact shows  ["#contact"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

---- viewport 900x1200 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
PASS  nav click #how lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #outputs lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #contact lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=1079px
PASS  header returns on scroll up  y=721px
PASS  classList not written every scroll frame  1 class mutations over 84 frames of a 60 step sweep
PASS  above 720px all three links plus the ghost button show  ["#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#how","outline":"2px solid","visible":true},{"href":"#outputs","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true},{"href":"https://github.com/markandeyay/constructsite","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

---- viewport 1440x900 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
PASS  nav click #how lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #outputs lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #contact lands clear of the 64px header  target top=160px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=1079px
PASS  header returns on scroll up  y=721px
PASS  classList not written every scroll frame  1 class mutations over 83 frames of a 60 step sweep
PASS  above 720px all three links plus the ghost button show  ["#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#how","outline":"2px solid","visible":true},{"href":"#outputs","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true},{"href":"https://github.com/markandeyay/constructsite","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

ALL CHECKS PASSED
```

### Reduced motion, extra pass at 1440x900

```
no-motion class on <html>: true
anchor click #outputs lands at top=80px (native fallback, exact)
first Tab on a fresh load focuses .skip-link at left=16 top=16
activating the skip link, then Tab: focus lands on .btn--primary.sec-hero__cta inside #main
console errors: []
```

### Skip link focus handoff, both motion modes

```
no-preference  next Tab after skip -> A .btn .btn--primary .sec-hero__cta href="#how" insideMain=true insideHeader=false
reduce         next Tab after skip -> A .btn .btn--primary .sec-hero__cta href="#how" insideMain=true insideHeader=false
```


---

## 6. Addendum, 2026-09-18T04:10:00Z: `.site-footer__link`

Reopened by the orchestrator for a one-line markup change. WP-11's touch-target
audit found the footer repository anchor measured 45x19 at 720px and below and
carried no class, so the only selector that could reach it would be a bare
element descendant selector, which spec 18.3 bans.

Change, and the only change: the repository anchor in `src/sections/footer.ts`
now carries `class="site-footer__link"`, the frozen name. No sizing rule was
added here. This package owns no stylesheet, and the rule belongs in
`responsive.css`, which WP-11 owns.

### Measured after WP-11's rule landed

WP-11's rule is present: `.site-footer__link { padding-block: var(--sp-3); }`
inside the 720px block of `responsive.css`. Rebuilt and re-measured against a
fresh `vite preview`:

```
width 375  ->  45.33 x 43.00   padding-block 12px/12px, line-height 18px, font-size 12px
width 414  ->  45.33 x 43.00   padding-block 12px/12px
width 720  ->  45.33 x 43.00   padding-block 12px/12px
width 721  ->  45.33 x 19.00   padding-block 0/0 (rule correctly does not apply above 720px)
```

The class is present in the rendered markup and the rule reaches it, so the
hook works. The result is **43.00px tall, 1px short of the 44px minimum.**
WP-11's rule comment assumes a 19.99px line box; the real box is an 18px
line-height plus the 1px `border-bottom` that `components.css` puts on
`.site-footer__right a`, which is 19px, and 19 + 12 + 12 = 43. Raising
`padding-block` to 13px, or adding `min-height: 44px` with
`display: inline-flex; align-items: center`, closes it. That is WP-11's call to
make in WP-11's file. Logged under `## Cross-WP requests`. Width is 45.33px,
which already clears 44.

### Regression re-check, full suite at 375, 900 and 1440

Everything this package owns still passes. The only FAIL in the run below is
the 44px assertion on WP-11's rule described above.

- No email address and no `mailto:` anywhere in the rendered page, at all three
  viewports. Override A4 holds.
- The skip link is still the first focusable element at all three viewports and
  still becomes visible on focus.
- `classList` is still written only on an actual state flip: 1 class mutation
  across a 60 step sweep spanning 84 frames, at all three viewports.
- `npx tsc --noEmit` clean, `npm run build` clean.
- Zero console errors and zero unhandled rejections at all three viewports.

Unrelated improvement observed, not made by this package: nav anchor clicks now
land at **80px** rather than the 160px recorded in section 3 above, so the
double-offset request to WP-03 has been acted on in `core/scroll.ts`. One
outlier of 146px on `#contact` at 1440px is a late reveal changing the document
height mid-flight, and it is still clear of the 64px header.

```
---- viewport 375x812 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
SKIP  nav click #how (link hidden at this width)
SKIP  nav click #outputs (link hidden at this width)
PASS  nav click #contact lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=973px
PASS  header returns on scroll up  y=615px
PASS  classList not written every scroll frame  1 class mutations over 84 frames of a 60 step sweep
PASS  below 720px only Contact shows  ["#contact"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer repo link carries .site-footer__link  {"href":"https://github.com/markandeyay/constructsite","w":45,"h":43,"display":"block","minH":"auto","pad":"12px 0px"}
FAIL  footer repo link touch target  45x43 display=block min-height=auto padding=12px 0px
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

---- viewport 900x1200 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
PASS  nav click #how lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #outputs lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #contact lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=1079px
PASS  header returns on scroll up  y=721px
PASS  classList not written every scroll frame  1 class mutations over 84 frames of a 60 step sweep
PASS  above 720px all three links plus the ghost button show  ["#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer repo link carries .site-footer__link  {"href":"https://github.com/markandeyay/constructsite","w":45,"h":19,"display":"block","minH":"auto","pad":"0px"}
PASS  footer repo link touch target  45x19 display=block min-height=auto padding=0px
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#how","outline":"2px solid","visible":true},{"href":"#outputs","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true},{"href":"https://github.com/markandeyay/constructsite","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

---- viewport 1440x900 ----
PASS  skip link is first focusable  {"cls":"skip-link","href":"#main","text":"Skip to content","left":16,"top":16,"w":128,"h":49}
PASS  skip link visible when focused  rect left=16 top=16 128x49
PASS  all header anchors resolve  ["#main","#hero","#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  contact link carries .site-header__link--contact
PASS  nav click #how lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #outputs lands clear of the 64px header  target top=80px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  nav click #contact lands clear of the 64px header  target top=100px (Lenis adds the 80px scroll-margin-top on top of the -80 offset, see the cross-WP request)
PASS  no border at y=0
PASS  border appears past 40px  border-bottom-width=1px
PASS  header hides on scroll down past 400px  y=1079px
PASS  header returns on scroll up  y=721px
PASS  classList not written every scroll frame  1 class mutations over 84 frames of a 60 step sweep
PASS  above 720px all three links plus the ghost button show  ["#how","#outputs","#contact","https://github.com/markandeyay/constructsite"]
PASS  no mailto: anywhere in the page
PASS  no email address rendered  []
PASS  footer left is the Construct line  "Construct. Chapel Hill, NC."
PASS  footer right links GitHub and shows the year  GITHUB | 2026 -> https://github.com/markandeyay/constructsite
PASS  footer repo link carries .site-footer__link  {"href":"https://github.com/markandeyay/constructsite","w":45,"h":19,"display":"block","minH":"auto","pad":"0px"}
PASS  footer repo link touch target  45x19 display=block min-height=auto padding=0px
PASS  footer has a single hairline rule above  1px rgb(226, 223, 217)
PASS  header is a <header> landmark, footer a <footer>
PASS  nav is a <nav> with an accessible name  "Construct"
PASS  header is 64px and opaque, no backdrop-filter  64px bg=rgb(250, 249, 247) backdrop=none
PASS  every keyboard-reachable chrome link has a visible focus ring  [{"href":"#hero","outline":"2px solid","visible":true},{"href":"#how","outline":"2px solid","visible":true},{"href":"#outputs","outline":"2px solid","visible":true},{"href":"#contact","outline":"2px solid","visible":true},{"href":"https://github.com/markandeyay/constructsite","outline":"2px solid","visible":true}]
PASS  zero console errors  []
PASS  zero unhandled rejections  []

1 CHECK(S) FAILED
```
