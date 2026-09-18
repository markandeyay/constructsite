# Construct Website: Build Progress

## Claimed
(none yet)
WP-01 CLAIMED by WP-01 at 2026-09-18T01:16:56Z
WP-02 CLAIMED by WP-02 at 2026-09-18T01:17:09Z
WP-03 CLAIMED by WP-03 at 2026-09-18T01:17:49Z
WP-04 CLAIMED by WP-04 at 2026-09-18T01:20:00Z
WP-05 CLAIMED by WP-05 at 2026-09-18T01:18:40Z
WP-16 CLAIMED by WP-16 at 2026-09-18T01:18:55Z

WP-06 CLAIMED by WP-06 at 2026-09-18T01:29:48Z
WP-12 CLAIMED by WP-12 at 2026-09-18T01:31:34Z
WP-08 CLAIMED by WP-08 at 2026-09-18T01:52:00Z
WP-07 CLAIMED by WP-07 at 2026-09-18T01:45:00Z
WP-09a CLAIMED by WP-09a at 2026-09-18T01:43:46Z
WP-09b CLAIMED by WP-09b at 2026-09-18T02:10:00Z

WP-09c CLAIMED by WP-09c at 2026-09-18T02:20:00Z

WP-09d CLAIMED by WP-09d at 2026-09-18T01:44:54Z

WP-09e CLAIMED by WP-09e at 2026-09-18T02:30:00Z

WP-09f CLAIMED by WP-09f at 2026-09-18T01:45:50Z

WP-09g CLAIMED by WP-09g at 2026-09-18T02:40:00Z

WP-09i CLAIMED by WP-09i at 2026-09-18T03:05:00Z

WP-10 CLAIMED by WP-10 at 2026-09-18T02:12:43Z
WP-11 CLAIMED by WP-11 at 2026-09-18T04:05:00Z

WP-13 CLAIMED by WP-13 at 2026-09-18T02:13:41Z

## Done
(none yet)
WP-01 DONE by WP-01 at 2026-09-18T01:22:17Z
WP-05 DONE by WP-05 at 2026-09-18T01:40:00Z
WP-04 DONE by WP-04 at 2026-09-18T01:34:00Z
WP-03 DONE by WP-03 at 2026-09-18T01:24:28Z
WP-16 DONE by WP-16 at 2026-09-18T01:28:38Z
WP-02 DONE by WP-02 at 2026-09-18T01:31:07Z

WP-12 DONE by WP-12 at 2026-09-18T01:58:00Z
WP-07 DONE by WP-07 at 2026-09-18T02:05:00Z

WP-06 DONE by WP-06 at 2026-09-18T01:45:17Z
WP-09e DONE by WP-09e at 2026-09-18T02:55:00Z

WP-08 DONE by WP-08 at 2026-09-18T02:18:00Z
WP-09b DONE by WP-09b at 2026-09-18T02:34:00Z

WP-09d DONE by WP-09d at 2026-09-18T01:51:46Z

WP-09g DONE by WP-09g at 2026-09-18T03:05:00Z

WP-09c DONE by WP-09c at 2026-09-18T02:55:00Z
WP-09i DONE by WP-09i at 2026-09-18T03:40:00Z

WP-09f DONE by WP-09f at 2026-09-18T01:59:47Z

WP-09a DONE by WP-09a at 2026-09-18T02:10:09Z

WP-10 DONE by WP-10 at 2026-09-18T02:22:49Z

WP-13 DONE by WP-13 at 2026-09-18T02:23:31Z

## Blocked
(none yet)

WP-06: public/data/demo-plasmid.json is a PLACEHOLDER awaiting a real construct export. It carries a literal "_TODO" key, the site logs a console warning on every load while that key is present, and progress/WP-06.md records the shape to replace it with. Override A6 Q2.
WP-09e: public/data/demo-validation.json is a PLACEHOLDER awaiting a real validation export. Per override A6 Q2 no real export from a product run was available, and spec section 7.5 forbids inventing validation output and presenting it as product output. The file carries a literal "_TODO" key, the site logs a console WARNING (never an error) on every load while that key is present, and progress/WP-09e.md records the shape to replace it with.

## Spec challenges
(none yet)
WP-02: Instrument Serif width-matched size-adjust measures 135.09% against Georgia, which renders the display serif about 38% larger in cap height on a cached load than the fallback on an uncached one. Layout is identical either way and CLS stays 0.00. Shipped as measured per spec 5.3; the one-line alternative (size-adjust 100%, ascent 91.70%, descent 21.90%) is in progress/WP-02.md section 4.

## Cross-WP requests
(none yet)
WP-05 -> WP-02: layout.css and components.css consume font tokens named --font-display, --font-body, --font-mono. Please define those three names in tokens.css.
WP-05 -> header author (src/sections/header.ts): add the modifier class site-header__link--contact to the Contact nav anchor. components.css uses it to collapse the nav to Contact only below 720px without a :not() chain.
WP-05 -> WP-01: section shells may carry class="section"; layout.css also targets main > section so the shell rhythm applies either way.
WP-07 -> WP-04: the 3D canvas aria-label and the still alt text (spec section 13.2) live in src/fx/viewer3d.ts, because the frozen copy.structure shape in contract C3 carries no alt key. Move them into copy.ts if that shape is ever reopened.

WP-06 -> WP-09a and WP-09c: put class="fx-plasmid" on the plasmid map container IN THE MARKUP, before calling mountPlasmid(el). That class carries the reserved aspect-ratio 1 box in the WP-06 sections.css block, and the spec section 12 CLS budget is exactly 0.00. The miniature in section 03 is mountPlasmid(el, { mini: true }).
WP-09i -> WP-04: the header <nav> needs an accessible name (spec 13.2). copy.ts has no key for it, so the nav is named by aria-labelledby pointing at the wordmark anchor. Add a header.navLabel key if the C3 shape is ever reopened.

WP-09c -> WP-04: copy.how carries no prompt string key. Spec section 7.3 step 1 types out a prompt in mono, and the frozen C3 shape for copy.how has num, kicker, title, steps, chip1, chip2 and chip3 only. Section 03 therefore types copy.how.steps[0].line. If the C3 shape is ever reopened, add copy.how.prompt and src/sections/how.ts will read it instead.
WP-09i -> WP-03: scrollToTarget(el, -80) overshoots under Lenis. Lenis already subtracts the element's scroll-margin-top, which spec 4.0 sets to 80px on every shell, so the -80 is applied twice and the target lands 160px below the viewport top instead of 80px. The native reduced-motion path lands at exactly 80px. Both clear the 64px header, so nothing is broken; the fix is to subtract the resolved scroll-margin-top before handing the offset to Lenis.

## Orchestrator decisions
- Repo seeded by orchestrator: git init, PROGRESS.md, progress/. WP-01 must NOT recreate these.
- Apps Script mail relay DEPLOYED and verified by the orchestrator. Project name construct-mail-line, web app, Execute as Me, Who has access Anyone, authorized. A real form-encoded POST returned {"ok":true} with HTTP 200. WP-12 must paste the /exec URL recorded in progress/ORCHESTRATOR-appsscript.md into SCRIPT_URL in src/contact.ts.
- Orchestrator created an EMPTY src/styles/responsive.css purely so the main.ts import graph resolves before Wave 4. WP-11 still owns its contents.
- The target repository is PUBLIC. CONSTRUCT_WEBSITE_SYSTEM_DESIGN.md and BUILD_CONTRACT.md are therefore gitignored and stay local: both documents carry the naming and the personal names that override A1 and A2 forbid from shipping. Build state (PROGRESS.md, progress/) is still committed.
- Commit identity is set repo-locally to "Construct" with the GitHub noreply address, so no personal name and no personal email is published in the commit history.
- Vercel project constructsite created and connected to the GitHub repo, so main auto-deploys. Production host is constructsite-nine.vercel.app, set in the single SITE_ORIGIN constant in vite.config.ts. First production build succeeded in 14s and the live URL returns 200 with correctly injected absolute og:image and og:url. og-card.png itself is still pending WP-13.
- Note for WP-10: section 02 (problem) deliberately exports NO initScrub. It is a prose section with nothing to scrub, so spec section 6.4's initProblemScrub() line has no counterpart and section 02 is simply omitted from the single matchMedia block. WP-10 must check which sections actually export initScrub rather than assuming all seven do.
WP-09d -> WP-10: src/sections/outputs.ts exports no initScrub. Section 04 has no pin and no scrub by design (spec 7.4 allows the card reveal and nothing else), so there is no initOutputsScrub to call from the matchMedia block.
- BUDGET FAILURE found by the orchestrator at Wave 3 integration: the initial JS chunk is 646.58 kB raw / 212.38 kB gzipped, against the spec section 12 budget of under 200 KB gzipped. 3Dmol is correctly code split into its own 587.80 kB chunk and does NOT count, so the overage is in the entry chunk itself. The likely fix, and the one WP-15 should try first, is to dynamically import seqviz inside fx/plasmid.ts. Spec section 8.6 already mounts the map after first paint inside requestIdleCallback, so deferring the import changes no visual behaviour and no timing contract, it only moves seqviz plus React out of the entry chunk. Do NOT solve this by raising the budget.

WP-09g -> WP-10: src/sections/traction.ts exports mount only. Section 07 has nothing to scrub, so there is no initTractionScrub despite the spec section 6.4 example listing one. Do not import or call it.
- INCIDENT, recorded by the orchestrator: WP-09g cleaned up by stopping every node process whose command line matched "vite preview" and stopped 20 of them, which may have killed sibling agents' preview servers mid-verification. Nothing on disk was modified; only servers were stopped. The four packages still running at the time were warned to restart their own server and re-run before reporting, so an infrastructure failure is not recorded as a real finding. Convention for the rest of the build: stop only the specific process you started, by PID. Never pattern match across all node processes while other agents are running.
- Note for WP-10: sections 02 (problem), 04 (outputs) and 07 (traction) export NO initScrub. Spec section 6.4's example lists initProblemScrub, initOutputsScrub and initTractionScrub; none of them exist. WP-10 must inspect what each module actually exports rather than following that example literally.
- Note for WP-10, from WP-09c: call the pinned section as how.initScrub() in document position 03, and register its RETURN VALUE as the matchMedia cleanup by returning it from the matchMedia callback. It returns a cleanup that kills the trigger, removes the staged class and settles every step visible. It creates exactly one ScrollTrigger, measured at 4500px on a 900px viewport, which is the required five viewport heights.
- Note for WP-04 or a later copy pass, filed by WP-09c: copy.how has no prompt-string key, because the frozen C3 shape carries only num, kicker, title, steps and chip1 to chip3. Step 1 therefore types out copy.how.steps[0].line rather than a dedicated prompt string. Nothing was invented. If a real prompt string is wanted later it needs a copy.ts change, not a section change.
- Orchestrator reopened WP-03 to fix the scrollToTarget offset double-count that WP-09i measured: Lenis already subtracts the resolved scroll-margin-top, so the explicit -80 lands the target at 160px under Lenis against exactly 80px on the native reduced-motion path. Both clear the 64px header so nothing is visibly broken, but it violates WP-03's own contract that subscribers cannot tell which driver is running. Fixed in core/scroll.ts, not at the call site.
- Note for WP-17, from WP-09f: spec section 19 has a checkbox reading "the section 11.6 structure caption matches the construct actually shown in the hero". It is satisfied through the override Q12 branch, which cuts the linking clause entirely, so there is no correspondence claim left to match. Do NOT read that checkbox as requiring a linking clause to be present. Requiring one would in fact be a truth failure, because the demo plasmid payload is a placeholder and any asserted correspondence would be false.
- Orchestrator verified the authoritative initScrub list for WP-10 by grepping for a real export rather than trusting the spec section 6.4 example: ONLY hero.ts, how.ts and structure.ts export initScrub. problem, outputs, validation, traction, contact, header and footer do NOT. Spec section 6.4 lists seven init calls; four of them have no counterpart in the built code. WP-10 must wire exactly three, in document order: hero (01), how (03), structure (06), and must register how.initScrub's return value as the matchMedia cleanup.
- CLS BUG CLASS found by WP-09a and confirmed worth a sweep. main.ts is a deferred module, so Chromium paints the empty section shells BEFORE any mount() runs. If a section's mount() adds a root class whose CSS changes padding, margin or display relative to the shared shell rhythm in layout.css, the page reflows after first paint. WP-09a measured CLS 0.0525 / 0.1088 / 0.0304 at 375 / 900 / 1440 from exactly this, against a budget of exactly 0.00, and removing its padding override took all six measurements to 0.0000. Every other section that overrides box properties on its own .sec-* root has the same defect.
- ORCHESTRATOR EXCEPTION granted to WP-11: WP-11 may edit other packages' sections.css blocks, but ONLY to remove or neutralise padding, margin and display overrides on a .sec-* root that cause post-paint reflow, and only after measuring CLS. All other content of those blocks stays untouched. This exception exists because the defect is cross-cutting, its owners have finished, and the responsive pass is the package that already owns cross-section layout.
- G1 RISK found by WP-09a: at 1440x900 the hero copy column's bottom edge lands at y=1044, so the two buttons and the status line sit just below the fold. Spec goal G1 is measured by "hero copy readable without scrolling, at 375px and 1440px", so this misses a stated goal. The headline runs six lines at that width. Nothing is stranded invisible, because the hero load beats are clock driven. Assigned to WP-11 to resolve within the fixed --t-hero token and the fixed 55/45 split.
- favicon.svg does not exist, so index.html's icon link 404s and intermittently trips the section 16.6 zero-console-errors gate. WP-13 owns that file under contract C8 and must ship it.
- ORCHESTRATOR CHANGE to src/styles/base.css, Instrument Serif @font-face only. Switched from the width-matched overrides (size-adjust 135.09%) to Georgia's own measured metrics (size-adjust 100%, ascent-override 91.70%, descent-override 21.90%), which are the exact alternative values WP-02 measured and offered in its own spec challenge. Reason, found by looking at the deployed page rather than at a number: Instrument Serif is a condensed display face, so matching it to Georgia's advance width inflated the rendered headline by about 35 percent. On the live page that produced an 84px headline running SIX lines, 582px tall, whose box started at y=156 while the kicker ended at y=169, so the headline visibly overlapped the kicker. font-display: optional never swaps, so matching the fallback's metrics buys no layout stability for this face and CLS stays 0.00 either way. Body and mono keep their measured width-matched values, which are correct for them.
- Orchestrator visual review of the DEPLOYED page at 1536x695, done by looking rather than by reading numbers. Findings: (1) the hero headline rendered at 84px across SIX lines, 582px tall in a 572px column, with the hero bottom at y=1101 against a 695px viewport, so goal G1 fails; root cause was the Instrument Serif width-matched size-adjust, now fixed. (2) The headline box started at y=156 while the kicker ended at y=169, so they visibly overlapped; reopened with WP-09a. (3) The plasmid map renders correctly and looks right: muted feature arcs, mono labels, construct name and length, no neon and no glow, so goal G2 is met. (4) Section 02 reads exactly as intended.
- Note for WP-14: on the deployed page, querying the hero map SVG's aria-label returned an EMPTY string, although WP-06 reported shipping a real worded label. It may sit on a wrapper rather than the svg element. Spec section 13.2 requires the plasmid map to carry role="img" and a real aria-label describing the construct in words. Verify this on the BUILT page and file a cross-WP request to WP-06 if it is genuinely missing.
- Method note for everyone: the hero map mounts in requestIdleCallback, so a screenshot taken immediately after load shows an empty map container. That is not a defect. Wait for the map to mount before judging or capturing the hero.
- Orchestrator decision on WP-10's two flagged items. (1) The single extra import line beside the existing motion import is ACCEPTED: an ES import cannot live inside a function body and the reserved markers sit inside boot(), so there was no alternative. No existing line was edited. (2) The opt-in debug global behind the st-debug query string is KEPT THROUGH WAVE 4 ON PURPOSE, because WP-16 explicitly asked for ScrollTrigger to be reachable so the reduced-motion pin and scrub check can be exact rather than falling back to a DOM scan for pin spacers. WP-14 and WP-15 should use it. It must be REMOVED at final hardening before the production ship, and WP-17 must verify it is gone from the shipped bundle.
- Method note worth reusing, from WP-10: driving scroll with window.scrollTo produces a clean-looking but WORTHLESS result while Lenis is installed, because Lenis reverts a programmatic jump on the next frame and scrollY never leaves 0. Any package measuring scroll behaviour must drive it with real wheel events. The orchestrator hit the same trap during visual review.
- Note for any package asserting on ScrollTrigger positions: the absolute pin START drifts about 100px run to run because the plasmid map mounts in an idle callback and fonts settle asynchronously. The pin DISTANCE is 4500 on a 900px viewport in every run. Assert on distance, never on absolute start.
- ACTION ITEM tied to the demo data placeholder, raised by WP-13: public/og-card.png is a real render of the live hero, so it currently shows WP-06's placeholder construct pCON-DEMO-01. That is correct today. When a real construct export replaces demo-plasmid.json, the social card MUST be regenerated or it will advertise a construct the site no longer shows. Exact reproduction parameters are in progress/WP-13.md.
- WP-13 did not need its contract C8 carve-out: WP-01's head already matched spec section 14 verbatim and every string already matched copy.meta, so index.html was left unmodified. The built dist carries absolute og:image and og:url and contains no remaining SITE_ORIGIN token anywhere.
