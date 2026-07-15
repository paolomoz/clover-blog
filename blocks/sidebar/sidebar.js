/**
 * sidebar — article right rail (captured rail blocks as donor cards).
 *
 * Authoring: one row per rail card. Cell content is plain semantic content:
 * - h3 heading → rail title
 * - list of plain links → topic chips
 * - list of items with image + link → post teasers
 * - lone image → eBook cover
 * - short leading paragraph before the heading → kicker
 * - bold link → Lime button
 * A card with only a heading + copy (no links/images) becomes the newsletter
 * card; its email form is generated (presentational — no backend in phase 1).
 *
 * On article pages two rail cards are index-driven (never stale):
 * - topic chips → top tags by article count, linked to their /tag pages
 * - post teasers → latest 3 posts sharing the article's primary tag
 *   (falls back to the article's category; excludes self); the card heading
 *   becomes "More posts about <label>"
 * The newsletter and eBook promo cards stay as authored (not article-driven).
 * Authored content remains the no-index fallback.
 */
import { createOptimizedPicture } from '../../scripts/aem.js';

const meta = (n) => document.head.querySelector(`meta[name="${n}"]`)?.content || '';

/** label → /tag/... path map from the indexed tag archive pages */
function buildTagPages(index) {
  const map = new Map();
  index.filter((i) => i.path.startsWith('/tag/')).forEach((i) => {
    const label = (i.title || '').replace(/ Archives - Clover Blog$/, '').trim();
    if (label) map.set(label, i.path);
  });
  return map;
}

function popularTopics(index, tagPages, count) {
  const tally = new Map();
  index.filter((i) => i.template === 'article').forEach((i) => {
    (i.tags || '').split(',').map((t) => t.trim()).filter(Boolean)
      .forEach((t) => tally.set(t, (tally.get(t) || 0) + 1));
  });
  return [...tally.entries()]
    .filter(([label]) => tagPages.has(label))
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([label]) => ({ label, path: tagPages.get(label) }));
}

function buildTeaser(item, title) {
  const li = document.createElement('li');
  li.className = 'rail-teaser';
  if (item.image && !item.image.startsWith('/default-meta-image')) {
    li.append(createOptimizedPicture(item.image, title, false, [{ width: '128' }]));
  } else {
    li.classList.add('no-thumb');
  }
  const a = document.createElement('a');
  a.href = item.path;
  a.textContent = title;
  li.append(a);
  return li;
}

async function decorateDynamicRail(block) {
  if (meta('template') !== 'article') return;
  // the rail is below the fold on mobile — let the LCP image and fonts land
  // before spending bandwidth on the query index
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => { window.addEventListener('load', resolve, { once: true }); });
  }
  const {
    fetchQueryIndex, byNewest, stripSuffix, dedupeByTitle,
  } = await import('../article-list/article-list.js');
  const index = await fetchQueryIndex();
  if (!index || !index.length) return;

  // popular topics: top tags by count, linked to their tag pages
  const topicList = block.querySelector('.topic-list');
  if (topicList) {
    const topics = popularTopics(index, buildTagPages(index), 4);
    if (topics.length) {
      topicList.replaceChildren(...topics.map(({ label, path }) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'tag-link';
        a.href = path;
        a.textContent = label;
        li.append(a);
        return li;
      }));
    }
  }

  // teasers: latest 3 posts sharing the article's primary tag (else category)
  const teasers = block.querySelector('.rail-teasers');
  if (teasers) {
    const here = window.location.pathname;
    const tag = meta('article-tags').split(',').map((t) => t.trim()).filter(Boolean)[0];
    const label = tag || meta('category');
    const pool = dedupeByTitle(index).filter((i) => i.template === 'article' && i.path !== here
      && (tag ? (i.tags || '').includes(tag) : i.category === label));
    pool.sort(byNewest);
    const picks = pool.slice(0, 3);
    if (label && picks.length) {
      const heading = teasers.closest('.rail-card')?.querySelector('.rail-title');
      if (heading) heading.textContent = `More posts about ${label}`;
      teasers.replaceChildren(...picks.map((i) => buildTeaser(i, stripSuffix(i.title) || i.path)));
    }
  }
}

export default function decorate(block) {
  const cards = [];

  [...block.children].forEach((row) => {
    const cell = row.querySelector(':scope > div');
    if (!cell || !cell.textContent.trim()) return;

    const card = document.createElement('div');
    card.className = 'rail-card';

    let heading = null;
    [...cell.children].forEach((el) => {
      if (/^H[1-6]$/.test(el.tagName)) {
        el.classList.add('rail-title');
        heading = el;
        card.append(el);
      } else if (el.tagName === 'UL') {
        if (el.querySelector('picture, img')) {
          el.classList.add('rail-teasers');
          el.querySelectorAll(':scope > li').forEach((li) => {
            li.classList.add('rail-teaser');
            if (!li.querySelector('picture, img')) li.classList.add('no-thumb');
          });
        } else {
          el.classList.add('topic-list');
          el.querySelectorAll('a').forEach((a) => a.classList.add('tag-link'));
        }
        card.append(el);
      } else if (el.tagName === 'P' && el.querySelector('picture, img') && !el.querySelector('a')) {
        el.classList.add('rail-cover');
        card.append(el);
      } else if (el.tagName === 'P' && el.querySelector('a.button')) {
        el.classList.add('rail-cta');
        card.append(el);
      } else if (el.tagName === 'P' && !heading && !el.querySelector('a')) {
        el.classList.add('kicker');
        card.append(el);
      } else if (el.tagName === 'P' && !el.querySelector('a')) {
        el.classList.add('rail-copy');
        card.append(el);
      } else {
        card.append(el);
      }
    });

    // newsletter card: heading + copy only → generated (presentational) form
    if (heading && !card.querySelector('ul, picture, a')) {
      const form = document.createElement('form');
      form.className = 'rail-form';
      form.innerHTML = `
        <input type="email" name="email" aria-label="Email address" autocomplete="email">
        <button class="btn-quiet" type="submit">Submit</button>
      `;
      form.addEventListener('submit', (e) => e.preventDefault());
      card.append(form);
    }

    cards.push(card);
  });

  block.replaceChildren(...cards);

  // article rail goes index-driven; authored content is the fallback
  decorateDynamicRail(block).catch(() => {});
}
