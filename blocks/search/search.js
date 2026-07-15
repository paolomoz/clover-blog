/**
 * search — full search results page over /search-index.json, donor grammar.
 *
 * Rebuilt from the original WP Search & Filter Pro page
 * (blog.clover.com/search/?_sf_s=…): result rows with contextual excerpts,
 * count line, category/topic/type facets with counts.
 *
 * URL-driven state: ?q=&category=a,b&tag=x — facets are multi-select
 * (OR within a facet, AND across facets, matching Search & Filter Pro).
 * Results load progressively (24 at a time) via an IntersectionObserver
 * sentinel — no page param.
 * Ranking: per term — title 8 > tags/category 4 > description 2 > body 1.
 * Zero external deps; falls back to /query-index.json if the search index
 * is not yet published.
 */
import { createOptimizedPicture } from '../../scripts/aem.js';

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

// ---------- facets ----------
const FACETS = [
  { key: 'category', label: 'Category', of: (item) => (item.category ? [item.category] : []) },
  { key: 'tag', label: 'Topic', of: (item) => (item.tags ? String(item.tags).split(/,\s*/).filter(Boolean) : []) },
  { key: 'type', label: 'Type', of: (item) => (item.template ? [item.template] : []) },
];

// ---------- state ----------
/** facet values are multi-select: comma-list (or repeated) URL params */
function readState() {
  const p = new URLSearchParams(window.location.search);
  const list = (k) => p.getAll(k)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  const state = { q: (p.get('q') || '').trim() };
  FACETS.forEach((f) => { state[f.key] = list(f.key); });
  return state;
}

function writeState(state, { push = false } = {}) {
  const url = new URL(window.location);
  url.searchParams.delete('page'); // legacy pagination param — no longer used
  const set = (k, v) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  set('q', state.q);
  FACETS.forEach((f) => set(f.key, state[f.key].join(',')));
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

export default async function decorate(block) {
  block.textContent = '';

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

  const chips = document.createElement('div');
  chips.className = 'search-chips';
  chips.setAttribute('aria-label', 'Active filters');

  const results = document.createElement('div');
  results.className = 'search-results';
  results.dataset.role = 'results';

  const loading = document.createElement('div');
  loading.className = 'search-loading';
  loading.hidden = true;
  loading.innerHTML = '<span class="search-spinner" aria-hidden="true"></span> Loading more results…';

  const sentinel = document.createElement('div');
  sentinel.className = 'search-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');

  const backTop = document.createElement('button');
  backTop.type = 'button';
  backTop.className = 'search-back-top';
  backTop.innerHTML = '<span aria-hidden="true">↑</span> Back to top';
  backTop.hidden = true;

  mainCol.append(chips, results, loading, sentinel);
  layout.append(rail, mainCol);
  block.append(form, status, layout, backTop);

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

  // ---------- selection helpers ----------
  const isSelected = (key, value) => state[key].some((v) => norm(v) === norm(value));

  // forward declaration so facet builders can re-render
  let render = () => {};
  /** control to re-focus after a re-render, so keyboard flow is unbroken */
  let refocus = null; // { key, value } | 'clear'

  const toggleFacet = (key, value) => {
    const i = state[key].findIndex((v) => norm(v) === norm(value));
    if (i >= 0) state[key].splice(i, 1);
    else state[key].push(value);
    refocus = { key, value };
    writeState(state, { push: true });
    render();
  };

  const clearFacets = () => {
    FACETS.forEach((f) => { state[f.key] = []; });
    refocus = 'clear';
    writeState(state, { push: true });
    render();
  };

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
  /** expanded/collapsed state survives re-renders — groups never auto-collapse */
  const openState = new Map(); // facet.key -> boolean (user's last choice)

  const buildFacetGroup = (facet, values, openByDefault) => {
    const details = document.createElement('details');
    details.className = 'facet-group';
    details.dataset.facet = facet.key;
    details.open = openState.has(facet.key) ? openState.get(facet.key) : openByDefault;
    if (!openState.has(facet.key)) openState.set(facet.key, details.open);
    const summary = document.createElement('summary');
    summary.textContent = facet.label;
    details.append(summary);
    details.addEventListener('toggle', () => openState.set(facet.key, details.open));

    const list = document.createElement('ul');
    list.className = 'facet-list';
    values.forEach(({ value, count }) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.className = 'facet-value';
      const selected = isSelected(facet.key, value);
      if (selected) label.classList.add('selected');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'facet-check';
      cb.checked = selected;
      cb.dataset.facet = facet.key;
      cb.dataset.value = value;
      cb.addEventListener('change', () => toggleFacet(facet.key, value));
      const name = document.createElement('span');
      name.className = 'facet-name';
      name.textContent = value;
      const chip = document.createElement('span');
      chip.className = 'facet-count';
      chip.textContent = count;
      label.append(cb, name, chip);
      li.append(label);
      list.append(li);
    });
    details.append(list);
    return details;
  };

  // ---------- render: selected chips row ----------
  const buildChips = () => {
    chips.textContent = '';
    const active = FACETS.flatMap((facet) => state[facet.key]
      .map((value) => ({ facet, value })));
    if (!active.length) return;
    active.forEach(({ facet, value }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'search-chip';
      chip.setAttribute('aria-label', `Remove filter ${value}`);
      const name = document.createElement('span');
      name.textContent = value;
      chip.append(name);
      const x = document.createElement('span');
      x.className = 'search-chip-x';
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      chip.append(x);
      chip.addEventListener('click', () => toggleFacet(facet.key, value));
      chips.append(chip);
    });
    const clearAll = document.createElement('button');
    clearAll.type = 'button';
    clearAll.className = 'search-chip search-chip-clear';
    clearAll.textContent = 'Clear filters';
    clearAll.addEventListener('click', clearFacets);
    chips.append(clearAll);
  };

  // ---------- progressive loading ----------
  let filtered = []; // current filtered+ranked entries
  let currentTerms = [];
  let shown = 0;
  let anyFilter = false;

  const updateStatus = () => {
    if (!currentTerms.length && !anyFilter) {
      status.textContent = `Search ${index.length} articles — or browse by category and topic.`;
    } else if (!filtered.length) {
      status.textContent = state.q ? `No results for “${state.q}”.` : 'No results for the selected filters.';
    } else {
      const label = state.q ? ` for “${state.q}”` : '';
      status.textContent = `Showing ${shown} of ${filtered.length} result${filtered.length === 1 ? '' : 's'}${label}`;
    }
  };

  /** append the next batch in a single fragment (no per-row layout thrash) */
  const appendBatch = () => {
    const next = filtered.slice(shown, shown + PAGE_SIZE);
    const frag = document.createDocumentFragment();
    next.forEach((e) => frag.append(buildRow(e.item, currentTerms)));
    results.append(frag);
    shown += next.length;
    loading.hidden = true;
    sentinel.hidden = shown >= filtered.length;
    updateStatus();
  };

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((en) => en.isIntersecting)) return;
    if (shown >= filtered.length) return;
    loading.hidden = false;
    window.requestAnimationFrame(appendBatch);
  }, { rootMargin: '600px 0px' });
  io.observe(sentinel);

  // ---------- back to top ----------
  backTop.addEventListener('click', () => {
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input.focus({ preventScroll: true });
  });
  window.addEventListener('scroll', () => {
    backTop.hidden = window.scrollY < window.innerHeight * 2;
  }, { passive: true });

  // ---------- render: everything ----------
  render = () => {
    currentTerms = norm(state.q).split(/\s+/).filter(Boolean);
    const terms = currentTerms;

    // query matches (before facet filtering) — basis for facet counts
    const queryMatches = [];
    index.forEach((item) => {
      const score = terms.length ? scoreItem(item, terms) : 1;
      if (score > 0) queryMatches.push({ item, score });
    });

    // OR within a facet, AND across facets (Search & Filter Pro semantics)
    const matchesFacets = (entry, skipKey) => FACETS.every((facet) => {
      if (facet.key === skipKey || !state[facet.key].length) return true;
      return facet.of(entry.item).some((v) => isSelected(facet.key, v));
    });

    // preserve per-list scroll position across the rail rebuild
    const scrollPos = new Map();
    rail.querySelectorAll('.facet-group').forEach((g) => {
      const list = g.querySelector('.facet-list');
      if (list) scrollPos.set(g.dataset.facet, list.scrollTop);
    });

    // facet rail with counts scoped to query + other-facet selections
    rail.textContent = '';
    const railTitle = document.createElement('h2');
    railTitle.className = 'search-facets-title';
    railTitle.textContent = 'Filter by:';
    rail.append(railTitle);
    anyFilter = FACETS.some((facet) => state[facet.key].length > 0);
    FACETS.forEach((facet) => {
      const pool = queryMatches.filter((e) => matchesFacets(e, facet.key));
      const counts = new Map();
      pool.forEach((e) => facet.of(e.item).forEach((v) => {
        const k = v.trim();
        if (k) counts.set(k, (counts.get(k) || 0) + 1);
      }));
      const values = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      // keep selected values visible even at zero results
      state[facet.key].forEach((sel) => {
        if (!values.some((v) => norm(v.value) === norm(sel))) {
          values.unshift({ value: sel, count: 0 });
        }
      });
      // default expanded when the list is short; user toggles persist after
      const open = values.length <= 12;
      if (values.length) rail.append(buildFacetGroup(facet, values, open));
    });
    if (anyFilter) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'facet-clear';
      clear.dataset.role = 'clear';
      clear.textContent = 'Clear filters';
      clear.addEventListener('click', clearFacets);
      rail.append(clear);
    }

    // restore facet-list scroll positions
    rail.querySelectorAll('.facet-group').forEach((g) => {
      const list = g.querySelector('.facet-list');
      if (list && scrollPos.has(g.dataset.facet)) list.scrollTop = scrollPos.get(g.dataset.facet);
    });

    buildChips();

    // filtered + ranked results
    filtered = queryMatches.filter((e) => matchesFacets(e, null));
    filtered.sort((a, b) => b.score - a.score
      || String(b.item.publicationDate || '').localeCompare(String(a.item.publicationDate || '')));

    results.textContent = '';
    results.dataset.total = String(filtered.length);
    shown = 0;
    appendBatch(); // first 24 — the sentinel pulls in the rest

    // re-focus the control the user just used (keyboard flow, no scroll jump)
    if (refocus) {
      let el = null;
      if (refocus === 'clear') {
        el = rail.querySelector('input.facet-check') || input;
      } else {
        const { key, value } = refocus;
        el = [...rail.querySelectorAll('input.facet-check')]
          .find((cb) => cb.dataset.facet === key && norm(cb.dataset.value) === norm(value));
      }
      if (el) el.focus({ preventScroll: true });
      refocus = null;
    }
  };

  // ---------- wiring ----------
  let timer;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = input.value.trim();
      writeState(state);
      render();
    }, 250);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    window.clearTimeout(timer);
    state.q = input.value.trim();
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
