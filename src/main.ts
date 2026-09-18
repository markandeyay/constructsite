import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/sections.css';
import './styles/responsive.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { initMotion } from './core/motion';
/* WP-10: the one line this package adds outside its reserved region, because
   an ES import declaration cannot live inside a function body and the region
   markers sit inside boot(). Spec section 6.4 requires the matchMedia query to
   come from core/motion.ts rather than being retyped. Nothing above is edited.
   Recorded in progress/WP-10.md. */
import { MQ_DESKTOP_MOTION } from './core/motion';
import { initScroll } from './core/scroll';

import * as header from './sections/header';
import * as hero from './sections/hero';
import * as problem from './sections/problem';
import * as how from './sections/how';
import * as outputs from './sections/outputs';
import * as validation from './sections/validation';
import * as structure from './sections/structure';
import * as traction from './sections/traction';
import * as contact from './sections/contact';
import * as footer from './sections/footer';

gsap.registerPlugin(ScrollTrigger);

type SectionModule = { mount(root: HTMLElement): void };

/** Mounts a section against its shell. A missing shell is a no-op: no log, no throw. */
function mountInto(id: string, mod: SectionModule): void {
  const shell = document.getElementById(id);
  if (!shell) return;
  mod.mount(shell);
}

function boot(): void {
  initMotion();
  initScroll();

  mountInto('site-header', header);
  mountInto('hero', hero);
  mountInto('problem', problem);
  mountInto('how', how);
  mountInto('outputs', outputs);
  mountInto('validation', validation);
  mountInto('structure', structure);
  mountInto('traction', traction);
  mountInto('contact', contact);
  mountInto('site-footer', footer);

  /* ==== WP-10: scroll choreography. Only WP-10 writes here. ==== */
  /*
   * The one-matchMedia rule (spec section 6.4). Every pin and every scrub on
   * the page is created here, inside ONE `gsap.matchMedia()` block, in
   * document order. Not per section, not in section modules.
   *
   * Why the order matters: ScrollTrigger measures start positions at creation
   * time. A trigger created before an earlier one measures against a document
   * that does not yet contain the earlier pin spacer, which yields a stale
   * start and a visible teleport when scrolling across the boundary. Ordering
   * is the fix, and ordering can only be guaranteed from one place.
   *
   * Exactly three section modules export `initScrub`, verified by grepping for
   * a real export rather than by following the spec's seven-call example:
   * hero (01), how (03), structure (06). Sections 02, 04, 05, 07 and 08 have
   * no pin and no scrub by design, so there is nothing to call for them.
   *
   * The query is `MQ_DESKTOP_MOTION`, which carries BOTH gates at once: the
   * 901px width gate from spec section 5.4 and the reduced-motion gate from
   * spec section 13.1, which requires pins and scrubs to be skipped entirely
   * when reduced motion is on. It is imported, never retyped, so the string
   * cannot drift from `core/motion.ts`.
   */
  const mm = gsap.matchMedia();

  mm.add(MQ_DESKTOP_MOTION, () => {
    const cleanups: Array<() => void> = [];

    const collect = (result: void | (() => void)): void => {
      if (typeof result === 'function') cleanups.push(result);
    };

    collect(hero.initScrub());       // 01
    collect(how.initScrub());        // 03, the only pin on the page
    collect(structure.initScrub());  // 06

    // Returned to matchMedia as the cleanup for this query. GSAP runs it when
    // the query stops matching, so each trigger is killed and each section is
    // handed back in its settled state.
    return () => {
      for (const fn of cleanups) fn();
    };
  });

  /*
   * Debug handle for the WP-10 verification harness. Opt-in only: it attaches
   * nothing unless the URL carries `st-debug`, so a normal visitor's `window`
   * is untouched. It is present in the shipped bundle, and progress/WP-10.md
   * says so plainly.
   */
  if (location.search.includes('st-debug')) {
    (window as unknown as Record<string, unknown>).__WP10 = { gsap, ScrollTrigger };
  }
  /* ==== /WP-10 ==== */

  /* ==== WP-15: perf instrumentation. Only WP-15 writes here. ==== */
  /* ==== /WP-15 ==== */

  void document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}

boot();
