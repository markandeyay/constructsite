# Construct

The public marketing site for **Construct**, a system that turns plain-English
intent into validated, ready-to-build genetic designs.

A researcher describes what they want to make. Construct returns a complete
design, checked against biological and manufacturing rules, plus the
instructions to build it at the bench.

## What this repository is

A single static page. No backend, no accounts, no CMS, no routing. Everything
the page shows is either a real product surface or data shipped alongside the
build.

- **Vite** and **TypeScript**, no UI framework
- **GSAP** with **ScrollTrigger** for scroll-driven motion, **Lenis** for smooth
  scrolling, both behind one scroll spine
- **seqviz** for the circular plasmid map in the hero
- **3Dmol.js** for the protein structure, loaded lazily and skipped entirely on
  small screens
- Hand-written CSS driven by a small custom-property token set
- A contact form that posts to a Google Apps Script mail relay, so there is no
  server and no API key in the client

## Running it locally

Requires Node 20.9 or newer.

```bash
npm ci
npm run dev
```

The dev server prints a local URL. To build and preview the production output:

```bash
npm run build
npm run preview
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build.

## Layout

```
index.html          empty section shells only, one per page section
src/main.ts         entry point: imports styles, mounts sections, owns motion setup
src/content/copy.ts every user-facing string on the site, in one file
src/core/           scroll spine, motion primitives, reveal observer
src/sections/       one module per section, each builds its own DOM
src/fx/             plasmid map, 3D viewer, text effects, counter
src/styles/         tokens, base, layout, components, sections, responsive
public/             fonts, favicon, social card, demo data, structures
qa/                 performance, accessibility, screenshot, link and copy checks
```

Every section module exports `mount(root)` and optionally `initScrub()`. Section
markup is built in TypeScript, never authored in `index.html`. All pinned and
scrubbed choreography is created in a single `matchMedia` block in `src/main.ts`,
in document order, because ScrollTrigger measures start positions at creation
time and out-of-order pins produce stale triggers.

## Checks

Run these against a running preview build:

```bash
node qa/copylint.mjs    # banned phrasings, claim safety, no em dashes
node qa/links.mjs       # every href resolves
node qa/a11y.mjs        # axe, contrast, focus order, reduced motion
node qa/perf.mjs        # frame timing and long tasks under CPU throttle
node qa/shots.mjs       # screenshots at three viewports
```

`copylint.mjs` needs no server and can run on its own.

## Contact form

The form posts to a Google Apps Script web app that relays the message as
email. The recipient address lives inside the Apps Script project and never
appears in the client bundle. `APPS_SCRIPT_SETUP.md` has the script and the
deployment runbook, including how to publish a new version after editing it.

## Deployment

Deployed on Vercel from `main`. `vercel.json` sets the build command, the output
directory and long cache headers for hashed assets and fonts.

The site origin is defined in exactly one place, the `SITE_ORIGIN` constant in
`vite.config.ts`. It is injected into the page metadata at build time, so
pointing the site at a custom domain is a one-line change.
