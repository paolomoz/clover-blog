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
 */
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
}
