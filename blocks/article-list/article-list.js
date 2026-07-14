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
    try {
      const resp = await fetch('/query-index.json?limit=1000');
      window.queryIndex = resp.ok ? (await resp.json()).data : [];
    } catch (e) {
      window.queryIndex = [];
    }
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
  items.slice(0, limit).forEach((item) => block.append(buildIndexCard(item)));
}
