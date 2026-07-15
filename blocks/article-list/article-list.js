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
 * - lead: home lead band — split lead (text left, bottom-anchored under a
 *   Formula index numeral; image right) + full-width thin-rule ledger of the
 *   remaining stories, indexed 02/03/…, lime-pill hover on the index.
 *   Donor signatures: stat-band Formula numerals + sub-nav lime active pill.
 *   Refero: washingtonpost.com lead composition; 19-86.fr / gustavo.work
 *   numeral + 1px-rule ledger rhythm (see article-list.css).
 *
 * Renders the donor story-card grammar (reuses blocks/cards/cards.css) so
 * listing pages scale without authoring hundreds of static cards.
 */
import { readBlockConfig, createOptimizedPicture, loadCSS } from '../../scripts/aem.js';

const slug = (s) => (s || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export async function fetchQueryIndex() {
  // memoize the in-flight promise so concurrent callers (article rail +
  // related-posts band) share one fetch instead of paging the index twice
  if (!window.queryIndexPromise) {
    window.queryIndexPromise = (async () => {
      // page through the index — the corpus is >1000 rows, above the
      // single-request cap of the .json pipeline
      const rows = [];
      const pageSize = 500;
      const getPage = (offset) => fetch(`/query-index.json?offset=${offset}&limit=${pageSize}`)
        .then((r) => (r.ok ? r.json() : { data: [], total: 0 }))
        .catch(() => ({ data: [], total: 0 }));
      // the corpus is known to be >1000 rows, so open with three concurrent
      // page requests instead of paying a round trip to learn the total
      const openWith = 3;
      const batch = await Promise.all(
        [...Array(openWith)].map((_, i) => getPage(i * pageSize)),
      );
      batch.forEach((p) => rows.push(...p.data));
      const total = Math.min(batch[0].total || 0, 5000);
      if (rows.length === openWith * pageSize && total > rows.length) {
        const more = [];
        for (let offset = rows.length; offset < total; offset += pageSize) {
          more.push(getPage(offset));
        }
        (await Promise.all(more)).forEach((p) => rows.push(...p.data));
      }
      return rows;
    })();
  }
  return window.queryIndexPromise;
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
  const {
    excerpt = true, ctaText = 'Read more', kicker, eager = false, imgWidth = '660',
  } = opts;
  const title = stripSuffix(item.title) || item.path;
  const card = document.createElement('article');
  card.className = 'card';

  if (item.image && !item.image.startsWith('/default-meta-image')) {
    const picture = createOptimizedPicture(item.image, title, eager, [{ width: imgWidth }]);
    if (eager) picture.querySelector('img').fetchPriority = 'high';
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
  const lead = block.classList.contains('lead');
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

  // in the first listing on the page, the first (feature) card image is the
  // likely LCP element — load it eagerly at top priority
  const firstList = block === document.querySelector('main .article-list.block');
  const buildCard = (item, i = -1) => buildIndexCard(item, {
    ctaText,
    kicker: cfg.kicker,
    eager: firstList && i === 0,
    // featured rows render 120-150px thumbs — don't ship 660px media
    imgWidth: featured && i > 0 ? '320' : '660',
  });

  if (lead) {
    // split lead + numbered ledger (see file header). DOM:
    //   article.card.lead-feature > picture + div.lead-copy (index, card-body)
    //   ol.lead-rail > li.card.lead-rail-item (index, card-body)
    const number = (n) => String(n).padStart(2, '0');
    const indexEl = (n) => {
      const p = document.createElement('p');
      p.className = 'lead-index';
      p.setAttribute('aria-hidden', 'true');
      p.textContent = number(n);
      return p;
    };
    const [first, ...rest] = items.slice(0, limit);
    if (first) {
      const feature = buildCard(first, 0);
      feature.classList.add('lead-feature');
      const copy = document.createElement('div');
      copy.className = 'lead-copy';
      copy.append(indexEl(1), feature.querySelector('.card-body'));
      feature.append(copy);
      block.append(feature);
    }
    if (rest.length) {
      const rail = document.createElement('ol');
      rail.className = 'lead-rail';
      rest.forEach((item, i) => {
        const li = document.createElement('li');
        li.className = 'card lead-rail-item';
        const built = buildIndexCard(item, { ctaText, kicker: cfg.kicker });
        // ledger rows are typographic: title link carries the action —
        // no thumbnail, no per-row CTA
        built.querySelector('.read-more').remove();
        li.append(indexEl(i + 2), built.querySelector('.card-body'));
        rail.append(li);
      });
      block.append(rail);
    }
    return;
  }

  if (featured || pair || webinars) {
    // donor feature grammar (see blocks/cards/cards.js): newest is the feature
    const cards = items.slice(0, limit).map((item, i) => buildCard(item, i));
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
    items.slice(shown, shown + limit)
      .forEach((item, i) => block.append(buildCard(item, shown + i)));
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
