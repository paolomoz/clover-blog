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
 * - related: two-up related-posts grid
 * - webinars: feature card + story card (CTA text becomes "Watch Now")
 */

function isHeading(el) {
  return /^H[1-6]$/.test(el.tagName);
}

function buildCard(row, ctaText) {
  const card = document.createElement('article');
  card.className = 'card';

  const cells = [...row.children];
  const imgCell = cells.find((c) => c.querySelector('picture'));
  const picture = imgCell ? imgCell.querySelector('picture') : null;
  if (picture) card.append(picture);

  const body = document.createElement('div');
  body.className = 'card-body';
  const contentCell = cells.find((c) => c !== imgCell && c.textContent.trim());

  let titleLink = null;
  let seenHeading = false;
  if (contentCell) {
    [...contentCell.children].forEach((el) => {
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

export default function decorate(block) {
  const featured = block.classList.contains('featured');
  const pair = block.classList.contains('featured-pair');
  const webinars = block.classList.contains('webinars');
  const ctaText = webinars ? 'Watch Now' : 'Read more';

  const cards = [...block.children].map((row) => buildCard(row, ctaText));

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
