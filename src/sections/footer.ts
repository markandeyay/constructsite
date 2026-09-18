/**
 * sections/footer.ts
 *
 * Site footer, spec section 7.10 as amended by overrides A1 and A4.
 * Class names frozen by BUILD_CONTRACT C5, styles in WP-05's `components.css`.
 *
 * Left is `copy.footer.left`. Right is `copy.footer.right`, whose parts are
 * split onto the flex row that `components.css` already spaces: the GitHub
 * part becomes the repository link, the rest is plain text. No string in this
 * file is authored here, and per override A4 there is no email address and no
 * `mailto:` link anywhere in the markup.
 */

import { copy, GITHUB_URL } from '../content/copy';

/** The separator `copy.footer.right` uses between its parts. */
const SEPARATOR = '·';

export function mount(root: HTMLElement): void {
  root.classList.add('site-footer');

  const inner = document.createElement('div');
  inner.className = 'site-footer__inner';

  const left = document.createElement('p');
  left.className = 'site-footer__left';
  left.textContent = copy.footer.left;
  inner.appendChild(left);

  const right = document.createElement('div');
  right.className = 'site-footer__right';

  copy.footer.right
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .forEach((part) => {
      if (part.toLowerCase().includes('github')) {
        const a = document.createElement('a');
        a.href = GITHUB_URL;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = part;
        right.appendChild(a);
        return;
      }

      const span = document.createElement('span');
      span.textContent = part;
      right.appendChild(span);
    });

  inner.appendChild(right);
  root.appendChild(inner);
}
