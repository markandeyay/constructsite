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

## Blocked
(none yet)

WP-06: public/data/demo-plasmid.json is a PLACEHOLDER awaiting a real construct export. It carries a literal "_TODO" key, the site logs a console warning on every load while that key is present, and progress/WP-06.md records the shape to replace it with. Override A6 Q2.

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

## Orchestrator decisions
- Repo seeded by orchestrator: git init, PROGRESS.md, progress/. WP-01 must NOT recreate these.
- Apps Script mail relay DEPLOYED and verified by the orchestrator. Project name construct-mail-line, web app, Execute as Me, Who has access Anyone, authorized. A real form-encoded POST returned {"ok":true} with HTTP 200. WP-12 must paste the /exec URL recorded in progress/ORCHESTRATOR-appsscript.md into SCRIPT_URL in src/contact.ts.
- Orchestrator created an EMPTY src/styles/responsive.css purely so the main.ts import graph resolves before Wave 4. WP-11 still owns its contents.
- The target repository is PUBLIC. CONSTRUCT_WEBSITE_SYSTEM_DESIGN.md and BUILD_CONTRACT.md are therefore gitignored and stay local: both documents carry the naming and the personal names that override A1 and A2 forbid from shipping. Build state (PROGRESS.md, progress/) is still committed.
- Commit identity is set repo-locally to "Construct" with the GitHub noreply address, so no personal name and no personal email is published in the commit history.
