/**
 * cards — donor story-card grammar (photo → Forest kicker → Altform title link
 * → Graphik excerpt → generated "Read more →").
 *
 * Authoring: one row per card, two cells: [image] [kicker p, h3 title (linked),
 * excerpt p, optional em note p, optional bold CTA link]. The read-more link is
 * generated from the title link (never authored).
 *
 * Variants:
 * - (none): responsive grid of story cards
 * - featured: first card is the large feature, the rest stack as rows beside it
 * - featured-pair: two feature cards side by side (2:1)
 * - related: two-up related-posts grid; on article pages the authored cards
 *   are replaced with index-driven related posts (same category, shared-tags
 *   boost, exclude self, latest first, 3 cards) so they can never go stale
 * - webinars: feature card + story card (CTA text becomes "Watch Now")
 * - text: no-image session cards (Forest ground, Lime eyebrow, feature list
 *   with Lime dash rhythm) — image cells are dropped, dash-lists in copy
 *   become styled lists. Refero refs: mode.com "Deep Forest Data Lab"
 *   (lime-on-forest blocks, 16px radii, flat) + artindumbo.com "Gallery
 *   Guidebook" (text-led event blocks).
 */

function isHeading(el) {
  return /^H[1-6]$/.test(el.tagName);
}

/**
 * text variant: dash-separated feature lines authored as a single <br>
 * paragraph become a real list so the card gets typographic rhythm.
 */
function listifyDashes(p) {
  const lines = p.innerHTML.split(/<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2 || !lines.every((l) => /^\s*(-|–|&ndash;|−)/.test(l))) return null;
  const ul = document.createElement('ul');
  ul.className = 'card-list';
  lines.forEach((l) => {
    const li = document.createElement('li');
    li.innerHTML = l.replace(/^\s*(-|–|&ndash;|−)\s*/, '');
    ul.append(li);
  });
  return ul;
}

/**
 * related variant on article pages: replace the authored (frozen) cards with
 * index-driven related posts. Same category, shared tags boost, exclude self,
 * latest first, 3 cards. Falls back to the authored cards if the index is
 * unavailable.
 */
async function buildRelated(block) {
  const meta = (n) => document.head.querySelector(`meta[name="${n}"]`)?.content || '';
  if (meta('template') !== 'article') return false;
  const { fetchQueryIndex, buildIndexCard, byNewest } = await import('../article-list/article-list.js');
  const index = await fetchQueryIndex();
  if (!index || !index.length) return false;

  const here = window.location.pathname;
  const category = meta('category');
  const tags = meta('article-tags').split(',').map((t) => t.trim()).filter(Boolean);

  let pool = index.filter((i) => i.template === 'article' && i.path !== here);
  if (category) {
    const sameCategory = pool.filter((i) => i.category === category);
    if (sameCategory.length >= 3) pool = sameCategory;
  }
  const score = (i) => tags.reduce((n, t) => n + ((i.tags || '').includes(t) ? 1 : 0), 0);
  pool.sort((a, b) => score(b) - score(a) || byNewest(a, b));
  const picks = pool.slice(0, 3);
  if (!picks.length) return false;

  block.classList.add('dynamic');
  block.replaceChildren(...picks.map((i) => buildIndexCard(i, { excerpt: false })));
  return true;
}

function buildCard(row, ctaText, text = false) {
  const card = document.createElement('article');
  card.className = 'card';

  const cells = [...row.children];
  const imgCell = cells.find((c) => c.querySelector('picture'));
  const picture = imgCell ? imgCell.querySelector('picture') : null;
  if (picture && !text) card.append(picture);

  const body = document.createElement('div');
  body.className = 'card-body';
  const contentCell = cells.find((c) => c !== imgCell && c.textContent.trim());

  let titleLink = null;
  let seenHeading = false;
  if (contentCell) {
    [...contentCell.children].forEach((el) => {
      if (text && el.tagName === 'P' && !el.querySelector('a')) {
        const list = listifyDashes(el);
        if (list) {
          body.append(list);
          return;
        }
      }
      if (isHeading(el)) {
        el.classList.add('card-title');
        const a = el.querySelector('a');
        if (a) {
          a.classList.add('title-link');
          a.classList.remove('button', 'primary', 'secondary');
          titleLink = a;
        }
        seenHeading = true;
        body.append(el);
      } else if (el.tagName === 'P' && el.querySelector('a.button')) {
        el.classList.add('card-cta');
        body.append(el);
      } else if (text && el.tagName === 'P' && !el.querySelector('a') && listifyDashes(el)) {
        body.append(listifyDashes(el));
        el.remove();
      } else if (el.tagName === 'P' && el.querySelector(':scope > em') && el.textContent.trim() === el.querySelector('em').textContent.trim()) {
        el.classList.add('card-note');
        body.append(el);
      } else if (el.tagName === 'P' && !seenHeading && !el.querySelector('a')) {
        el.classList.add('kicker');
        body.append(el);
      } else if (el.tagName === 'P' && !el.querySelector('a')) {
        el.classList.add('excerpt');
        body.append(el);
      } else {
        body.append(el);
      }
    });
  }

  // generated quiet affordance (donor grammar): from the title link
  if (titleLink && !body.querySelector('a.button')) {
    const more = document.createElement('a');
    more.className = 'read-more';
    more.href = titleLink.href;
    more.setAttribute('aria-label', `${ctaText}: ${titleLink.textContent.trim()}`);
    more.innerHTML = `${ctaText} <span aria-hidden="true">→</span>`;
    body.append(more);
  }

  card.append(body);
  return card;
}

export default async function decorate(block) {
  const featured = block.classList.contains('featured');
  const pair = block.classList.contains('featured-pair');
  const webinars = block.classList.contains('webinars');
  const text = block.classList.contains('text');
  const ctaText = webinars ? 'Watch Now' : 'Read more';

  // related posts on articles are index-driven (never stale); authored cards
  // remain the no-index fallback
  if (block.classList.contains('related')) {
    try {
      if (await buildRelated(block)) return;
    } catch (e) {
      // fall through to the authored cards
    }
  }

  const cards = [...block.children].map((row) => buildCard(row, ctaText, text));

  block.textContent = '';
  if (featured) {
    const [feature, ...rest] = cards;
    feature.classList.add('card-feature');
    block.append(feature);
    const rows = document.createElement('div');
    rows.className = 'card-rows';
    rest.forEach((c) => {
      c.classList.add('card-row');
      rows.append(c);
    });
    block.append(rows);
  } else if (pair || webinars) {
    cards.forEach((c, i) => {
      if (i === 0) c.classList.add('card-feature');
      block.append(c);
    });
  } else {
    cards.forEach((c) => block.append(c));
  }
}
