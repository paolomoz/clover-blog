/**
 * search — full search results page over /search-index.json, donor grammar.
 *
 * Rebuilt from the original WP Search & Filter Pro page
 * (blog.clover.com/search/?_sf_s=…): result rows with contextual excerpts,
 * count line, category/topic/type facets with counts, pagination.
 *
 * URL-driven state: ?q=&category=&tag=&type=&page=
 * Ranking: per term — title 8 > tags/category 4 > description 2 > body 1.
 * Zero external deps; falls back to /query-index.json if the search index
 * is not yet published.
 */
import { loadCSS, createOptimizedPicture } from '../../scripts/aem.js';

const PAGE_SIZE = 24;
const SNIPPET_WORDS = 40;

// ---------- data ----------
async function fetchIndex(target) {
  const rows = [];
  const pageSize = 500;
  let offset = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(`${target}?offset=${offset}&limit=${pageSize}`);
    if (!resp.ok) {
      if (offset === 0) return null; // index missing entirely
      break;
    }
    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json();
    rows.push(...json.data);
    offset += json.data.length;
    if (!json.data.length || offset >= json.total || offset > 5000) break;
  }
  return rows;
}

async function fetchSearchIndex() {
  if (!window.searchIndex) {
    window.searchIndex = (await fetchIndex('/search-index.json'))
      || (await fetchIndex('/query-index.json'))
      || [];
  }
  return window.searchIndex;
}

// ---------- matching + ranking ----------
const norm = (s) => (s == null ? '' : String(s)).toLowerCase();

/** page titles carry a site suffix the WP results never showed */
const stripSuffix = (t) => String(t || '').replace(/\s*[-–|]\s*(The Green\s*[-–|]\s*)?Clover Blog\s*$/i, '');

const fieldCache = new WeakMap();
function itemFields(item) {
  let f = fieldCache.get(item);
  if (!f) {
    const headings = Array.isArray(item.headings) ? item.headings.join(' ') : (item.headings || '');
    f = {
      title: norm(stripSuffix(item.title)),
      taxo: `${norm(item.category)} ${norm(item.tags)}`,
      description: norm(item.description),
      body: `${norm(item.text)} ${norm(headings)}`,
    };
    fieldCache.set(item, f);
  }
  return f;
}

/** score item against terms; 0 = no match (every term must hit somewhere) */
function scoreItem(item, terms) {
  const f = itemFields(item);
  let score = 0;
  for (let i = 0; i < terms.length; i += 1) {
    const t = terms[i];
    let s = 0;
    if (f.title.includes(t)) s += 8;
    if (f.taxo.includes(t)) s += 4;
    if (f.description.includes(t)) s += 2;
    if (f.body.includes(t)) s += 1;
    if (!s) return 0;
    score += s;
  }
  return score;
}

// ---------- state ----------
function readState() {
  const p = new URLSearchParams(window.location.search);
  return {
    q: (p.get('q') || '').trim(),
    category: p.get('category') || '',
    tag: p.get('tag') || '',
    type: p.get('type') || '',
    page: Math.max(1, Number.parseInt(p.get('page'), 10) || 1),
  };
}

function writeState(state, { push = false } = {}) {
  const url = new URL(window.location);
  const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set('q', state.q);
  set('category', state.category);
  set('tag', state.tag);
  set('type', state.type);
  set('page', state.page > 1 ? String(state.page) : '');
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

// ---------- highlighting + snippets ----------
/** append text to el with every term occurrence wrapped in <mark> (DOM-safe) */
function appendHighlighted(el, text, terms) {
  if (!terms.length) { el.append(text); return; }
  const lower = text.toLowerCase();
  let pos = 0;
  const nextHit = (from) => terms.reduce((acc, t) => {
    const i = lower.indexOf(t, from);
    if (i >= 0 && (acc.best < 0 || i < acc.best)) return { best: i, len: t.length };
    return acc;
  }, { best: -1, len: 0 });
  for (;;) {
    const { best, len: bestLen } = nextHit(pos);
    if (best < 0) break;
    if (best > pos) el.append(text.slice(pos, best));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(best, best + bestLen);
    el.append(mark);
    pos = best + bestLen;
  }
  if (pos < text.length) el.append(text.slice(pos));
}

/** contextual excerpt: window of words around the first body match (WP-style) */
function buildExcerpt(item, terms) {
  const text = String(item.text || '');
  const lower = text.toLowerCase();
  let hit = -1;
  terms.forEach((t) => {
    const i = lower.indexOf(t);
    if (i >= 0 && (hit < 0 || i < hit)) hit = i;
  });
  const descHit = terms.length && terms.every((t) => norm(item.description).includes(t));
  if (hit < 0 || descHit || !text) {
    return { text: item.description || '', leading: false, trailing: false };
  }
  // align window start to a word boundary a few words before the match
  const wordsBefore = text.slice(0, hit).split(/\s+/).length - 1;
  const start = Math.max(0, wordsBefore - 6);
  const words = text.split(/\s+/);
  return {
    text: words.slice(start, start + SNIPPET_WORDS).join(' '),
    leading: start > 0,
    trailing: start + SNIPPET_WORDS < words.length,
  };
}

// ---------- facets ----------
const FACETS = [
  { key: 'category', label: 'Category', of: (item) => (item.category ? [item.category] : []) },
  { key: 'tag', label: 'Topic', of: (item) => (item.tags ? String(item.tags).split(/,\s*/).filter(Boolean) : []) },
  { key: 'type', label: 'Type', of: (item) => (item.template ? [item.template] : []) },
];

export default async function decorate(block) {
  block.textContent = '';
  await loadCSS(`${window.hlx.codeBasePath}/blocks/pagination/pagination.css`);

  // ---------- static scaffold ----------
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

  const layout = document.createElement('div');
  layout.className = 'search-layout';

  const rail = document.createElement('aside');
  rail.className = 'search-facets';
  rail.dataset.role = 'facets';
  rail.setAttribute('aria-label', 'Filter results');

  const mainCol = document.createElement('div');
  mainCol.className = 'search-main';

  const results = document.createElement('div');
  results.className = 'search-results';
  results.dataset.role = 'results';

  const pagination = document.createElement('div');
  pagination.className = 'pagination search-pagination';

  mainCol.append(results, pagination);
  layout.append(rail, mainCol);
  block.append(form, status, layout);

  const input = form.querySelector('input');
  let state = readState();
  input.value = state.q;

  status.textContent = 'Loading the article index…';
  // exclude navigation/archive pages — the original WP search returns posts,
  // not category/tag archives or hub pages
  const NAV_TEMPLATES = new Set(['listing', 'hub', 'landing']);
  const index = (await fetchSearchIndex()).filter((item) => item.path !== '/search'
    && item.path !== '/' && !NAV_TEMPLATES.has(norm(item.template)));
  const usingFullText = index.some((item) => item.text);
  if (!usingFullText) {
    // eslint-disable-next-line no-console
    console.warn('search: no body text in index yet — recall limited to title/description');
  }

  // forward declaration so facet/pagination builders can re-render
  let render = () => {};

  // ---------- render: one row ----------
  const buildRow = (item, terms) => {
    const row = document.createElement('article');
    row.className = 'search-row';

    const body = document.createElement('div');
    body.className = 'search-row-body';

    if (item.category) {
      const kicker = document.createElement('p');
      kicker.className = 'search-kicker';
      kicker.textContent = item.category;
      body.append(kicker);
    }

    const title = document.createElement('h3');
    title.className = 'search-row-title';
    const link = document.createElement('a');
    link.href = item.path;
    appendHighlighted(link, stripSuffix(item.title) || item.path, terms);
    title.append(link);
    body.append(title);

    const ex = buildExcerpt(item, terms);
    if (ex.text) {
      const p = document.createElement('p');
      p.className = 'search-excerpt';
      if (ex.leading) p.append('…');
      appendHighlighted(p, ex.text, terms);
      if (ex.trailing) p.append('…');
      body.append(p);
    }

    if (item.publicationDate) {
      const date = document.createElement('p');
      date.className = 'search-date';
      const d = new Date(`${item.publicationDate}T00:00:00`);
      date.textContent = Number.isNaN(d.getTime()) ? item.publicationDate
        : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      body.append(date);
    }

    row.append(body);

    if (item.image && !item.image.startsWith('/default-meta-image')) {
      const media = document.createElement('a');
      media.className = 'search-row-media';
      media.href = item.path;
      media.tabIndex = -1;
      media.setAttribute('aria-hidden', 'true');
      media.append(createOptimizedPicture(item.image, '', false, [{ width: '400' }]));
      row.append(media);
    }
    return row;
  };

  // ---------- render: facets ----------
  const buildFacetGroup = (facet, values, openByDefault) => {
    const details = document.createElement('details');
    details.className = 'facet-group';
    if (openByDefault) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = facet.label;
    details.append(summary);

    const list = document.createElement('ul');
    list.className = 'facet-list';
    values.forEach(({ value, count }) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'facet-value';
      const selected = norm(state[facet.key]) === norm(value);
      btn.setAttribute('aria-pressed', String(selected));
      if (selected) btn.classList.add('selected');
      const name = document.createElement('span');
      name.className = 'facet-name';
      name.textContent = value;
      const chip = document.createElement('span');
      chip.className = 'facet-count';
      chip.textContent = count;
      btn.append(name, chip);
      btn.addEventListener('click', () => {
        state[facet.key] = selected ? '' : value;
        state.page = 1;
        writeState(state, { push: true });
        render();
      });
      li.append(btn);
      list.append(li);
    });
    details.append(list);
    return details;
  };

  // ---------- render: pagination ----------
  const buildPagination = (page, pages) => {
    pagination.textContent = '';
    if (pages <= 1) return;
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Pagination');
    const ul = document.createElement('ul');

    const goto = (p, textLabel, ariaLabel) => {
      const li = document.createElement('li');
      if (p === page && !ariaLabel) {
        const cur = document.createElement('span');
        cur.className = 'page-current';
        cur.setAttribute('aria-current', 'page');
        cur.textContent = textLabel;
        li.append(cur);
      } else {
        const a = document.createElement('a');
        a.className = 'page-link';
        a.textContent = textLabel;
        if (ariaLabel) a.setAttribute('aria-label', ariaLabel);
        const url = new URL(window.location);
        if (p > 1) url.searchParams.set('page', String(p));
        else url.searchParams.delete('page');
        a.href = url.toString();
        a.addEventListener('click', (e) => {
          e.preventDefault();
          state.page = p;
          writeState(state, { push: true });
          render();
          block.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        li.append(a);
      }
      ul.append(li);
    };

    const ellipsis = () => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'page-ellipsis';
      span.textContent = '…';
      li.append(span);
      ul.append(li);
    };

    if (page > 1) goto(page - 1, '‹', 'Previous page');
    const windowed = [];
    for (let p = 1; p <= pages; p += 1) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 2) windowed.push(p);
    }
    let prev = 0;
    windowed.forEach((p) => {
      if (p - prev > 1) ellipsis();
      goto(p, String(p));
      prev = p;
    });
    if (page < pages) goto(page + 1, '›', 'Next page');

    nav.append(ul);
    pagination.append(nav);
  };

  // ---------- render: everything ----------
  render = () => {
    const terms = norm(state.q).split(/\s+/).filter(Boolean);

    // query matches (before facet filtering) — basis for facet counts
    const queryMatches = [];
    index.forEach((item) => {
      const score = terms.length ? scoreItem(item, terms) : 1;
      if (score > 0) queryMatches.push({ item, score });
    });

    const matchesFacets = (entry, skipKey) => FACETS.every((facet) => {
      if (facet.key === skipKey || !state[facet.key]) return true;
      return facet.of(entry.item).some((v) => norm(v) === norm(state[facet.key]));
    });

    // facet rail with query-scoped counts (each facet ignores its own selection)
    rail.textContent = '';
    const railTitle = document.createElement('h2');
    railTitle.className = 'search-facets-title';
    railTitle.textContent = 'Filter by:';
    rail.append(railTitle);
    let anyFilter = false;
    FACETS.forEach((facet, fi) => {
      const pool = queryMatches.filter((e) => matchesFacets(e, facet.key));
      const counts = new Map();
      pool.forEach((e) => facet.of(e.item).forEach((v) => {
        const k = v.trim();
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      }));
      if (state[facet.key]) anyFilter = true;
      const values = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      // keep the selected value visible even at zero results
      if (state[facet.key] && !values.some((v) => norm(v.value) === norm(state[facet.key]))) {
        values.unshift({ value: state[facet.key], count: 0 });
      }
      const open = fi !== 1 || values.length <= 12;
      if (values.length) rail.append(buildFacetGroup(facet, values, open));
    });
    if (anyFilter) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'facet-clear';
      clear.textContent = 'Clear filters';
      clear.addEventListener('click', () => {
        state.category = ''; state.tag = ''; state.type = ''; state.page = 1;
        writeState(state, { push: true });
        render();
      });
      rail.append(clear);
    }

    // filtered + ranked results
    const filtered = queryMatches.filter((e) => matchesFacets(e, null));
    filtered.sort((a, b) => b.score - a.score
      || String(b.item.publicationDate || '').localeCompare(String(a.item.publicationDate || '')));

    const total = filtered.length;
    const pages = Math.ceil(total / PAGE_SIZE);
    if (state.page > pages) state.page = Math.max(1, pages);
    const startI = (state.page - 1) * PAGE_SIZE;
    const slice = filtered.slice(startI, startI + PAGE_SIZE);

    if (!terms.length && !anyFilter) {
      status.textContent = `Search ${index.length} articles — or browse by category and topic.`;
    } else if (!total) {
      status.textContent = state.q ? `No results for “${state.q}”.` : 'No results for the selected filters.';
    } else {
      const label = state.q ? ` for “${state.q}”` : '';
      status.textContent = `Showing ${startI + 1}–${startI + slice.length} of ${total} result${total === 1 ? '' : 's'}${label}`;
    }

    results.textContent = '';
    results.dataset.total = String(total);
    slice.forEach((e) => results.append(buildRow(e.item, terms)));
    buildPagination(state.page, pages);
  };

  // ---------- wiring ----------
  let timer;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = input.value.trim();
      state.page = 1;
      writeState(state);
      render();
    }, 250);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.clearTimeout(timer);
    state.q = input.value.trim();
    state.page = 1;
    writeState(state);
    render();
  });

  window.addEventListener('popstate', () => {
    state = readState();
    input.value = state.q;
    render();
  });

  render();
}
