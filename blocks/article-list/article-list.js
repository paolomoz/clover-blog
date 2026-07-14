/**
 * article-list — dynamic donor-card listing driven by /query-index.json.
 *
 * Authoring (config rows, key/value):
 * - category: filter by page category metadata (slug or label)
 * - tag: filter by tags metadata (substring match)
 * - template: filter by template metadata
 * - path-prefix: filter by path prefix (e.g. /meet-the-merchant/)
 * - limit: max cards (default 24)
 *
 * Renders the donor story-card grammar (reuses blocks/cards/cards.css) so
 * listing pages scale without authoring hundreds of static cards.
 */
import { readBlockConfig, createOptimizedPicture, loadCSS } from '../../scripts/aem.js';

const slug = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function fetchQueryIndex() {
  if (!window.queryIndex) {
    // page through the index — the corpus is >1000 rows, above the
    // single-request cap of the .json pipeline
    const rows = [];
    try {
      const pageSize = 500;
      let offset = 0;
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await fetch(`/query-index.json?offset=${offset}&limit=${pageSize}`);
        if (!resp.ok) break;
        // eslint-disable-next-line no-await-in-loop
        const json = await resp.json();
        rows.push(...json.data);
        offset += json.data.length;
        if (!json.data.length || offset >= json.total || offset > 5000) break;
      }
    } catch (e) {
      // network failure: render with whatever was fetched
    }
    window.queryIndex = rows;
  }
  return window.queryIndex;
}

export function buildIndexCard(item) {
  const card = document.createElement('article');
  card.className = 'card';

  if (item.image && !item.image.startsWith('/default-meta-image')) {
    const picture = createOptimizedPicture(item.image, item.title || '', false, [{ width: '660' }]);
    card.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  if (item.category) {
    const kicker = document.createElement('p');
    kicker.className = 'kicker';
    kicker.textContent = item.category;
    body.append(kicker);
  }

  const title = document.createElement('h3');
  title.className = 'card-title';
  const link = document.createElement('a');
  link.className = 'title-link';
  link.href = item.path;
  link.textContent = item.title || item.path;
  title.append(link);
  body.append(title);

  if (item.description) {
    const excerpt = document.createElement('p');
    excerpt.className = 'excerpt';
    excerpt.textContent = item.description;
    body.append(excerpt);
  }

  const more = document.createElement('a');
  more.className = 'read-more';
  more.href = item.path;
  more.setAttribute('aria-label', `Read more: ${item.title || item.path}`);
  more.innerHTML = 'Read more <span aria-hidden="true">→</span>';
  body.append(more);

  card.append(body);
  return card;
}

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  block.textContent = '';
  await loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards.css`);
  block.classList.add('cards');

  const index = await fetchQueryIndex();
  const here = window.location.pathname;
  const limit = Number.parseInt(cfg.limit, 10) || 24;

  const items = index.filter((item) => {
    if (item.path === here || item.path === '/') return false;
    if (cfg.category && slug(item.category) !== slug(cfg.category)) return false;
    if (cfg.template && slug(item.template) !== slug(cfg.template)) return false;
    if (cfg.tag && !slug(item.tags).includes(slug(cfg.tag))) return false;
    if (cfg['path-prefix'] && !item.path.startsWith(cfg['path-prefix'])) return false;
    return true;
  });

  items.sort((a, b) => (b.publicationDate || '').localeCompare(a.publicationDate || ''));

  let shown = 0;
  const renderMore = () => {
    items.slice(shown, shown + limit).forEach((item) => block.append(buildIndexCard(item)));
    shown = Math.min(shown + limit, items.length);
  };
  renderMore();

  if (items.length > shown) {
    const wrap = document.createElement('div');
    wrap.className = 'article-list-more';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button primary';
    btn.textContent = 'Load more';
    btn.addEventListener('click', () => {
      renderMore();
      if (shown >= items.length) wrap.remove();
      else btn.focus();
    });
    wrap.append(btn);
    block.after(wrap);
  }
}
