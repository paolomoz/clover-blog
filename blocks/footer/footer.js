/**
 * footer — Clover mega footer (captured chrome, chromePolicy: verbatim-copy;
 * uikit accordions simplified to a responsive grid).
 *
 * /footer document sections:
 * 1. Business types (heading + links) + social icon links
 * 2. link columns (repeating heading + list)
 * 3. disclaimer paragraphs
 * 4. copyright + legal links + locale label
 */
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

export default async function decorate(block) {
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  block.textContent = '';
  const sections = [...fragment.querySelectorAll(':scope > div')];
  const [side, links, disclaimer, copy] = sections;

  const inner = document.createElement('div');
  inner.className = 'footer-inner';

  if (side) {
    side.className = 'footer-side';
    side.querySelectorAll('ul').forEach((ul) => {
      if (ul.querySelector('picture, img')) ul.className = 'footer-social';
      else ul.className = 'footer-side-menu';
    });
    inner.append(side);
  }

  const main = document.createElement('div');
  main.className = 'footer-main';

  if (links) {
    links.className = 'footer-columns';
    const wrapper = links.querySelector(':scope > div') || links;
    const cols = [];
    let col = null;
    [...wrapper.children].forEach((el) => {
      if (/^H[1-6]$/.test(el.tagName)) {
        col = document.createElement('div');
        col.className = 'footer-col';
        el.classList.add('footer-col-title');
        col.append(el);
        cols.push(col);
      } else if (col) {
        col.append(el);
      }
    });
    wrapper.replaceChildren(...cols);
    main.append(links);
  }

  if (disclaimer) {
    disclaimer.className = 'footer-disclaimer';
    main.append(disclaimer);
  }

  if (copy) {
    copy.className = 'footer-copy';
    main.append(copy);
  }

  inner.append(main);
  block.append(inner);
}
