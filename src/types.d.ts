/**
 * Ambient declarations for the Construct site.
 *
 * `3dmol` is declared here per spec section 9.2 and the WP-01 detail block.
 * WP-07 narrows this if it needs more than `any`.
 *
 * `seqviz` is NOT declared here: it ships its own `dist/index.d.ts` which
 * types the vanilla `Viewer(element, options)` entry point directly, so an
 * ambient stub would only throw that typing away.
 */

declare module '3dmol';

/** Injected by `define` in vite.config.ts. The single source is SITE_ORIGIN there. */
declare const __SITE_ORIGIN__: string;
