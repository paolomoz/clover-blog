/**
 * search — client-side search over /query-index.json, rendering donor cards.
 *
 * Reads ?q= from the URL (the header blog-band search submits here), filters
 * title + description + category, and renders results with the shared card
 * grammar. No authored rows required.
 */
import { loadCSS } from '../../scripts/aem.js';
import { fetchQueryIndex, buildIndexCard } from '../article-list/article-list.js';

function matches(item, terms) {
  const haystack = `${item.title || ''} ${item.description || ''} ${item.category || ''} ${item.tags || ''}`.toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

export default async function decorate(block) {
  block.textContent = '';
  await loadCSS(`${window.hlx.codeBasePath}/blocks/cards/cards.css`);

  const form = document.createElement('form');
  form.className = 'search-form';
  form.setAttribute('role', 'search');
  form.action = '/search';
  form.method = 'get';
  form.innerHTML = `
    <label class="search-label" for="search-input">Search the blog</label>
    <span class="search-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20"><circle fill="none" stroke="currentColor" stroke-width="1.1" cx="9" cy="9" r="7"></circle><path fill="none" stroke="currentColor" stroke-width="1.1" d="M14,14 L18,18 L14,14 Z"></path></svg>
    </span>
    <input id="search-input" type="search" name="q" placeholder="Search the blog" autocomplete="off">
  `;

  const status = document.createElement('p');
  status.className = 'search-status';
  status.setAttribute('aria-live', 'polite');

  const results = document.createElement('div');
  results.className = 'search-results cards';

  block.append(form, status, results);

  const input = form.querySelector('input');
  const index = await fetchQueryIndex();

  const run = (q) => {
    results.textContent = '';
    const query = (q || '').trim();
    if (!query) {
      status.textContent = '';
      return;
    }
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = index.filter((item) => item.path !== '/search' && matches(item, terms));
    status.textContent = found.length
      ? `${found.length} result${found.length === 1 ? '' : 's'} for “${query}”`
      : `No results for “${query}”`;
    found.slice(0, 48).forEach((item) => results.append(buildIndexCard(item)));
  };

  const initial = new URLSearchParams(window.location.search).get('q') || '';
  input.value = initial;
  run(initial);

  let timer;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const url = new URL(window.location);
      if (input.value) url.searchParams.set('q', input.value);
      else url.searchParams.delete('q');
      window.history.replaceState(null, '', url);
      run(input.value);
    }, 200);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(input.value);
  });
}
