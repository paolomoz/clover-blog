/**
 * pagination — donor treatment: Forest page links, current page as Lime chip.
 *
 * Authoring: a single cell containing the page sequence — the current page as
 * plain text, other pages as links (e.g. "1 [2] [3] … [›]").
 */
export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div');
  if (!cell) return;

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Pagination');
  const ul = document.createElement('ul');

  const push = (el) => {
    const li = document.createElement('li');
    li.append(el);
    ul.append(li);
  };

  cell.querySelectorAll('p, div').forEach(() => {});
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent.trim().split(/\s+/).filter(Boolean).forEach((token) => {
          const current = document.createElement('span');
          current.className = 'page-current';
          current.setAttribute('aria-current', 'page');
          current.textContent = token;
          push(current);
        });
      } else if (child.tagName === 'A') {
        const a = child.cloneNode(true);
        a.className = 'page-link';
        if (a.textContent.trim() === '›') a.setAttribute('aria-label', 'Last page');
        push(a);
      } else if (child.childNodes) {
        walk(child);
      }
    });
  };
  walk(cell);

  nav.append(ul);
  block.replaceChildren(nav);
}
