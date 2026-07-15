/**
 * article-list — dynamic donor-card listing driven by /query-index.json.
 *
 * Authoring (config rows, key/value):
 * - category: filter by page category metadata (slug or label)
 * - tag: filter by tags metadata (substring match)
 * - template: filter by template metadata
 * - path-prefix: filter by path prefix (e.g. /meet-the-merchant/)
 * - exclude-paths: comma-separated path prefixes to skip
 * - offset: skip the first N matches (e.g. a "more stories" band after a latest band)
 * - limit: max cards (default 24)
 * - kicker: fixed kicker label for every card (otherwise the item category)
 * - load-more: "no" disables the Load more affordance (curated home bands)
 *
 * Variants (block classes, donor card grammar from cards.css):
 * - featured: first (newest) card is the large feature, the rest stack beside it
 * - featured-pair: two feature cards side by side
 * - webinars: feature card + story card, CTA text "Watch Now"
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

/** page titles carry a site suffix the donor cards never showed */
export const stripSuffix = (t) => String(t || '').replace(/\s*[-–|]\s*(The Green\s*[-–|]\s*)?Clover Blog\s*$/i, '');

/**
 * Newest-first sort key: publication date first (undated rows sink),
 * lastModified breaks ties (and orders undated corpora like webinars).
 */
export function byNewest(a, b) {
  const cmp = (b.publicationDate || '0000').localeCompare(a.publicationDate || '0000');
  return cmp || ((b.lastModified || 0) - (a.lastModified || 0));
}

/**
 * The corpus carries a few duplicate posts under stale slugs (the source 301s
 * them to a canonical path). Never show the same story twice in one listing;
 * among copies prefer the one whose path matches its own title slug.
 */
export function dedupeByTitle(items) {
  const matchesOwnSlug = (i) => i.path.split('/').pop() === slug(stripSuffix(i.title));
  const byKey = new Map();
  items.forEach((i) => {
    const key = stripSuffix(i.title) || i.path;
    const prev = byKey.get(key);
    if (!prev || (!matchesOwnSlug(prev) && matchesOwnSlug(i))) byKey.set(key, i);
  });
  const keep = new Set(byKey.values());
  return items.filter((i) => keep.has(i));
}

export function buildIndexCard(item, opts = {}) {
  const { excerpt = true, ctaText = 'Read more', kicker } = opts;
  const title = stripSuffix(item.title) || item.path;
  const card = document.createElement('article');
  card.className = 'card';

  if (item.image && !item.image.startsWith('/default-meta-image')) {
    const picture = createOptimizedPicture(item.image, title, false, [{ width: '660' }]);
    card.append(picture);
  }

  const body = document.createElement('div');
  body.className = 'card-body';

  // the donor never surfaced WP's "Uncategorized" bucket as a kicker
  const kickerText = kicker || (item.category === 'Uncategorized' ? '' : item.category);
  if (kickerText) {
    const p = document.createElement('p');
    p.className = 'kicker';
    p.textContent = kickerText;
    body.append(p);
  }

  const h3 = document.createElement('h3');
  h3.className = 'card-title';
  const link = document.createElement('a');
  link.className = 'title-link';
  link.href = item.path;
  link.textContent = title;
  h3.append(link);
  body.append(h3);

  if (excerpt && item.description) {
    const p = document.createElement('p');
    p.className = 'excerpt';
    p.textContent = item.description;
    body.append(p);
  }

  const more = document.createElement('a');
  more.className = 'read-more';
  more.href = item.path;
  more.setAttribute('aria-label', `${ctaText}: ${title}`);
  more.innerHTML = `${ctaText} <span aria-hidden="true">→</span>`;
  body.append(more);

  card.append(body);
  return card;
}

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  block.textContent = '';
  await loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards.css`);
  block.classList.add('cards');

  const featured = block.classList.contains('featured');
  const pair = block.classList.contains('featured-pair');
  const webinars = block.classList.contains('webinars');
  const ctaText = webinars ? 'Watch Now' : 'Read more';

  const index = await fetchQueryIndex();
  const here = window.location.pathname;
  const limit = Number.parseInt(cfg.limit, 10) || 24;
  const offset = Number.parseInt(cfg.offset, 10) || 0;
  const excludes = (cfg['exclude-paths'] || '').split(',').map((p) => p.trim()).filter(Boolean);

  const items = dedupeByTitle(index).filter((item) => {
    if (item.path === here || item.path === '/') return false;
    if (cfg.category && slug(item.category) !== slug(cfg.category)) return false;
    if (cfg.template && slug(item.template) !== slug(cfg.template)) return false;
    if (cfg.tag && !slug(item.tags).includes(slug(cfg.tag))) return false;
    if (cfg['path-prefix'] && !item.path.startsWith(cfg['path-prefix'])) return false;
    if (excludes.some((p) => item.path.startsWith(p))) return false;
    return true;
  });

  items.sort(byNewest);
  if (offset) items.splice(0, offset);

  const buildCard = (item) => buildIndexCard(item, { ctaText, kicker: cfg.kicker });

  if (featured || pair || webinars) {
    // donor feature grammar (see blocks/cards/cards.js): newest is the feature
    const cards = items.slice(0, limit).map(buildCard);
    const [feature, ...rest] = cards;
    if (feature) feature.classList.add('card-feature');
    if (featured) {
      if (feature) block.append(feature);
      const rows = document.createElement('div');
      rows.className = 'card-rows';
      rest.forEach((c) => {
        c.classList.add('card-row');
        rows.append(c);
      });
      block.append(rows);
    } else {
      cards.forEach((c) => block.append(c));
    }
    return;
  }

  let shown = 0;
  const renderMore = () => {
    items.slice(shown, shown + limit).forEach((item) => block.append(buildCard(item)));
    shown = Math.min(shown + limit, items.length);
  };
  renderMore();

  if (items.length > shown && slug(cfg['load-more']) !== 'no') {
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
