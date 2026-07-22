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

// the three sites this blog is published as; home is the fallback target when
// the current page has no translated twin
const LOCALES = [
  {
    code: 'en-US', label: 'United States (English)', flag: '🇺🇸', home: '/',
  },
  {
    code: 'en-CA', label: 'Canada (English)', flag: '🇨🇦', home: '/ca/',
  },
  {
    code: 'fr-CA', label: 'Canada (Français)', flag: '🇨🇦', home: '/ca-fr/',
  },
];

function currentLocale() {
  const p = window.location.pathname;
  if (/^\/ca-fr(\/|$)/.test(p)) return 'fr-CA';
  if (/^\/ca(\/|$)/.test(p)) return 'en-CA';
  return 'en-US';
}

/**
 * Country/language picker: replaces the static locale label with a button that
 * opens a "choose your country" dialog. Each option points at this page's
 * equivalent in that locale (read from the page's own hreflang alternates),
 * falling back to the locale home when no twin exists.
 */
function buildLocalePicker(copy) {
  if (!copy) return;
  const active = currentLocale();
  const fr = active === 'fr-CA';

  // hreflang alternates emitted in the page head → { code: same-origin path }
  const alt = {};
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => {
    const code = l.getAttribute('hreflang').toLowerCase();
    try { alt[code] = new URL(l.href, window.location.origin).pathname; } catch { /* skip */ }
  });
  const targetFor = (code) => alt[code.toLowerCase()] || LOCALES.find((x) => x.code === code).home;

  const here = LOCALES.find((l) => l.code === active) || LOCALES[0];

  // the static label paragraph is the last <p> in the copy section
  const label = [...copy.querySelectorAll('p')].reverse()
    .find((p) => /\(English\)|\(Fran|United States|Canada/i.test(p.textContent)) || copy.querySelector('p:last-child');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'locale-picker';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = `<span class="locale-flag" aria-hidden="true">${here.flag}</span> ${here.label}`;

  const dialog = document.createElement('dialog');
  dialog.className = 'locale-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="locale-dialog-inner">
      <button class="locale-close" value="close" aria-label="${fr ? 'Fermer' : 'Close'}">&times;</button>
      <h2>${fr ? 'Choisissez votre pays' : 'Choose your country'}</h2>
      <p class="locale-region">${fr ? 'AMÉRIQUE DU NORD' : 'NORTH AMERICA'}</p>
      <ul class="locale-list">
        ${LOCALES.map((l) => `<li>
          <a href="${targetFor(l.code)}"${l.code === active ? ' aria-current="true"' : ''}>
            <span class="locale-flag" aria-hidden="true">${l.flag}</span> ${l.label}
          </a></li>`).join('')}
      </ul>
    </form>`;

  btn.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  if (label) label.replaceWith(btn); else copy.append(btn);
  copy.append(dialog);
}

export default async function decorate(block) {
  // locale-prefixed default so /ca/* and /ca-fr/* load their own footer
  const localePrefix = (window.location.pathname.match(/^\/(?:ca|ca-fr)(?=\/|$)/) || [''])[0];
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : `${localePrefix}/footer`;
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
    buildLocalePicker(copy);
    main.append(copy);
  }

  inner.append(main);
  block.append(inner);
}
