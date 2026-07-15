import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  buildBlock,
} from './aem.js';

if (window.trustedTypes && window.trustedTypes.createPolicy) {
  const innerTT = window.trustedTypes.createPolicy('tt-inner', {
    createHTML: (s) => s, // avoid stack overflow
  });

  window.trustedTypes.createPolicy('default', {
    createHTML: (input, type, sink) => {
      let processedInput = input;
      if (/srcdoc\s*=/i.test(processedInput)) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('iframe[srcdoc]').forEach((el) => el.removeAttribute('srcdoc'));
        processedInput = doc.body.innerHTML;
      }
      if (sink.includes('createContextualFragment') || sink.includes('Document write')) {
        const doc = new DOMParser().parseFromString(innerTT.createHTML(processedInput), 'text/html');
        doc.querySelectorAll('script').forEach((el) => el.remove());
        processedInput = doc.body.innerHTML;
      }
      return processedInput;
    },
    createScriptURL: (input) => input,
    createScript: (input) => input,
  });
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Turns `/widgets/...` links into widget blocks.
 * @param {Element} main The container element
 */
function buildWidgetAutoBlocks(main) {
  const widgetLinks = [...main.querySelectorAll('a[href*="/widgets/"]')];
  widgetLinks.forEach((link) => {
    if (link.closest('.widget')) return;
    const newLink = link.cloneNode(true);
    const widgetBlock = buildBlock('widget', { elems: [newLink] });
    const p = link.closest('p');
    if (
      p
      && p.querySelectorAll('a').length === 1
      && p.querySelector('a') === link
      && p.textContent.trim() === link.textContent.trim()
    ) {
      p.replaceWith(widgetBlock);
    } else {
      link.replaceWith(widgetBlock);
    }
  });
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }
    buildWidgetAutoBlocks(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Ensures the LCP candidate image downloads at top priority. The head.html
 * inline script already flips the first sizeable content image; this is the
 * safety net for pictures created during decoration.
 * @param {Element} main The main element
 */
function prioritizeLcpImage(main) {
  const img = [...main.querySelectorAll('picture > img')]
    .find((i) => (Number.parseInt(i.getAttribute('width'), 10) || 0) >= 400);
  if (img) {
    img.loading = 'eager';
    img.fetchPriority = 'high';
  }
}

/**
 * Warms the cache for resources the lazy phase will need, so the sequential
 * section/block loading doesn't pay a network round trip per module:
 * - JS module + CSS of every block present on the page (the CSS goes in as a
 *   real stylesheet — rel=preload would shadow loadCSS's dedupe-by-href and
 *   the styles would never apply; blocks sit in still-hidden sections, so
 *   early scoped CSS has no visual side effects)
 * - the first page of /query-index.json on pages with index-driven blocks
 *   (article-list, and the article rail/related bands)
 * @param {Element} main The decorated main element
 */
function preloadLazyResources(main) {
  const hint = (rel, href, as) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (as) link.as = as;
    document.head.append(link);
  };
  const names = new Set([...main.querySelectorAll('div.block[data-block-name]')]
    .map((b) => b.dataset.blockName));
  names.forEach((name) => {
    hint('modulepreload', `${window.hlx.codeBasePath}/blocks/${name}/${name}.js`);
    loadCSS(`${window.hlx.codeBasePath}/blocks/${name}/${name}.css`);
  });
  if (names.has('article-list') || names.has('cards') || names.has('sidebar')) {
    hint('preload', `${window.hlx.codeBasePath}/query-index.json?offset=0&limit=500`, 'fetch');
  }
  // when a listing band sits at the top of the page (home, tag/category
  // pages) its first card image is the LCP — the band renders only once the
  // whole index has arrived, so put every page in flight now (the fetch in
  // article-list opens with the same three offsets) and start the fetch
  // early instead of when the block decorates
  const aboveFold = [...main.querySelectorAll(':scope > .section')].slice(0, 2);
  if (aboveFold.some((s) => s.querySelector('.article-list.block'))) {
    [500, 1000].forEach((offset) => {
      hint('preload', `${window.hlx.codeBasePath}/query-index.json?offset=${offset}&limit=500`, 'fetch');
    });
    import('../blocks/article-list/article-list.js')
      .then((mod) => mod.fetchQueryIndex())
      .catch(() => {});
  }
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  /* brand faces are self-hosted + preloaded with metric-matched fallbacks,
     so they are safe (no CLS, no extra origin) to load before first paint */
  loadFonts();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    prioritizeLcpImage(main);
    preloadLazyResources(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
