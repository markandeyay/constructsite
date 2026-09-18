import { defineConfig, type Plugin } from 'vite';

/**
 * THE ONLY PLACE THE SITE DOMAIN IS DEFINED.
 * Change this one line after the Vercel deploy and every absolute URL follows.
 */
export const SITE_ORIGIN = 'https://constructsite-nine.vercel.app';

/** Replaces every literal `%SITE_ORIGIN%` token in index.html with SITE_ORIGIN. */
function siteOriginPlugin(): Plugin {
  return {
    name: 'construct-site-origin',
    transformIndexHtml(html: string): string {
      return html.split('%SITE_ORIGIN%').join(SITE_ORIGIN);
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [siteOriginPlugin()],
  define: {
    __SITE_ORIGIN__: JSON.stringify(SITE_ORIGIN),
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {},
  },
});
