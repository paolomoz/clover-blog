/**
 * ebook-cards — Forest color-block resource cards (captured #30881c blocks
 * re-skinned to Forest per the donor direction).
 *
 * Authoring: one row per eBook, containing a single link whose text is the
 * eBook title and whose href is the PDF/resource URL. The badge and the
 * "View Now" button are generated.
 */
export default function decorate(block) {
  const cards = [];
  [...block.children].forEach((row) => {
    const link = row.querySelector('a');
    if (!link) return;

    const card = document.createElement('article');
    card.className = 'ebook-card';

    const badge = document.createElement('span');
    badge.className = 'ebook-badge';
    badge.textContent = 'eBook';

    const title = document.createElement('h2');
    title.className = 'ebook-title';
    const titleLink = document.createElement('a');
    titleLink.className = 'title-link';
    titleLink.href = link.href;
    titleLink.textContent = link.textContent.trim();
    title.append(titleLink);

    const cta = document.createElement('a');
    cta.className = 'btn-outline';
    cta.href = link.href;
    cta.setAttribute('aria-label', `View eBook: ${link.textContent.trim()}`);
    cta.textContent = 'View Now';

    card.append(badge, title, cta);
    cards.push(card);
  });
  block.replaceChildren(...cards);
}
