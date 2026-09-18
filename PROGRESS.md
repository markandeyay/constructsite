# Construct Website: Build Progress

## Claimed
(none yet)
WP-01 CLAIMED by WP-01 at 2026-09-18T01:16:56Z
WP-02 CLAIMED by WP-02 at 2026-09-18T01:17:09Z
WP-03 CLAIMED by WP-03 at 2026-09-18T01:17:49Z
WP-04 CLAIMED by WP-04 at 2026-09-18T01:20:00Z
WP-05 CLAIMED by WP-05 at 2026-09-18T01:18:40Z
WP-16 CLAIMED by WP-16 at 2026-09-18T01:18:55Z

## Done
(none yet)
WP-01 DONE by WP-01 at 2026-09-18T01:22:17Z
WP-05 DONE by WP-05 at 2026-09-18T01:40:00Z
WP-04 DONE by WP-04 at 2026-09-18T01:34:00Z
WP-03 DONE by WP-03 at 2026-09-18T01:24:28Z

## Blocked
(none yet)

## Spec challenges
(none yet)

## Cross-WP requests
(none yet)
WP-05 -> WP-02: layout.css and components.css consume font tokens named --font-display, --font-body, --font-mono. Please define those three names in tokens.css.
WP-05 -> header author (src/sections/header.ts): add the modifier class site-header__link--contact to the Contact nav anchor. components.css uses it to collapse the nav to Contact only below 720px without a :not() chain.
WP-05 -> WP-01: section shells may carry class="section"; layout.css also targets main > section so the shell rhythm applies either way.

## Orchestrator decisions
- Repo seeded by orchestrator: git init, PROGRESS.md, progress/. WP-01 must NOT recreate these.
- Apps Script mail relay DEPLOYED and verified by the orchestrator. Project name construct-mail-line, web app, Execute as Me, Who has access Anyone, authorized. A real form-encoded POST returned {"ok":true} with HTTP 200. WP-12 must paste the /exec URL recorded in progress/ORCHESTRATOR-appsscript.md into SCRIPT_URL in src/contact.ts.
- Orchestrator created an EMPTY src/styles/responsive.css purely so the main.ts import graph resolves before Wave 4. WP-11 still owns its contents.
- The target repository is PUBLIC. CONSTRUCT_WEBSITE_SYSTEM_DESIGN.md and BUILD_CONTRACT.md are therefore gitignored and stay local: both documents carry the naming and the personal names that override A1 and A2 forbid from shipping. Build state (PROGRESS.md, progress/) is still committed.
- Commit identity is set repo-locally to "Construct" with the GitHub noreply address, so no personal name and no personal email is published in the commit history.
