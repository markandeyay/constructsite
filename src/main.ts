import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/sections.css';
import './styles/responsive.css';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { initMotion } from './core/motion';
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
  /* ==== /WP-10 ==== */

  /* ==== WP-15: perf instrumentation. Only WP-15 writes here. ==== */
  /* ==== /WP-15 ==== */

  void document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}

boot();
