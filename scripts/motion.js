/**
 * motion.js — calm scroll reveals (stardust cinematic pass, register: editorial).
 *
 * Vocabulary (the non-intrusive subset of clover.com's FadeToastUp pattern,
 * tuned to DESIGN.json extensions.motion):
 * - section-content reveal: fade + 24px rise, once, on viewport entry
 * - card-group stagger: 90ms between cards revealed in the same observer
 *   batch, capped at 6 steps (450ms) so long grids never lag
 * - hero photo settle: 1.03 -> 1 scale once, right after load
 *
 * Disciplines:
 * - lazy phase only; zero eager bytes, no libraries
 * - hidden initial states exist ONLY under html.motion-ok (added here at
 *   runtime) — no-JS / failed-JS pages are fully visible static pages
 * - only elements fully below the viewport at init are primed (the page is
 *   already painted when this runs — nothing visible ever flashes out)
 * - prefers-reduced-motion: reduce -> the gate class is never added (and is
 *   removed live if the preference flips mid-session)
 * - transform/opacity only (zero CLS), CSS transitions only (no rAF loops),
 *   IntersectionObserver only (no scroll listeners), unobserve after reveal
 * - dynamic content (article-list "Load more", /search infinite scroll) is
 *   primed through a MutationObserver hook on main; batches revealed
 *   together get the same capped micro-stagger
 */

const STAGGER_MS = 90; // DESIGN.json extensions.motion.durations.stagger
const STAGGER_CAP = 5; // max extra delay 450ms — long batches never lag
const PRIME_BUDGET = 80; // animation-overload guard: past this, content is instant

const GRID_ITEMS = '.cards .card, .ebook-cards .ebook-card, .search-results .search-row';

export default function initMotion() {
  if (!('IntersectionObserver' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;
  const main = document.querySelector('main');
  if (!main) return;

  document.documentElement.classList.add('motion-ok');
  let budget = PRIME_BUDGET;

  const io = new IntersectionObserver((entries) => {
    // reveal everything that entered together as one staggered batch,
    // top-to-bottom / left-to-right
    const batch = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top
        || a.boundingClientRect.left - b.boundingClientRect.left);
    batch.forEach((entry, i) => {
      io.unobserve(entry.target);
      if (i) entry.target.style.setProperty('--mo-delay', `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`);
      entry.target.classList.add('mo-in');
    });
    // the huge top margin keeps anything the user jump-scrolled past
    // "intersecting", so it reveals instantly instead of sticking hidden;
    // the -10% bottom margin is the reveal line at 90% viewport height
  }, { rootMargin: '10000px 0px -10% 0px', threshold: [0, 0.05] });

  /** hide-and-observe elements that sit fully below the viewport (reads
      batched before writes; opacity/transform writes don't relayout) */
  const prime = (candidates) => {
    if (budget <= 0) return;
    const vh = window.innerHeight;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
    const sY = window.scrollY;
    candidates
      .map((el) => ({ el, top: el.getBoundingClientRect().top }))
      // below the viewport now, AND able to cross the reveal line before the
      // page runs out of scroll — content right above the footer that can
      // never reach 88% viewport height stays visible instead of primed
      .filter(({ el, top }) => top >= vh
        && (sY + top) - maxScroll < vh * 0.88
        && !el.hasAttribute('data-mo'))
      .forEach(({ el }) => {
        if (budget <= 0) return;
        budget -= 1;
        el.setAttribute('data-mo', '');
        io.observe(el);
      });
  };

  // section content: each wrapper reveals as one unit, except card grids,
  // whose items reveal individually (the batch above provides the stagger);
  // the search block re-renders too often to prime at the wrapper level —
  // its result rows arrive through the MutationObserver below
  const wrappers = [...main.querySelectorAll(':scope > .section > div')]
    .filter((wrapper) => !wrapper.matches('.search-wrapper'));
  const candidates = wrappers.flatMap((wrapper) => {
    const items = [...wrapper.querySelectorAll(GRID_ITEMS)];
    return items.length ? items : [wrapper];
  });
  prime(candidates);

  // dynamic appends: Load more cards, /search infinite-scroll rows —
  // anything already in view (or past the budget) just shows instantly
  const mo = new MutationObserver((mutations) => {
    const added = [];
    mutations.forEach((m) => m.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches(GRID_ITEMS)) added.push(node);
      else added.push(...node.querySelectorAll(GRID_ITEMS));
    }));
    if (added.length) prime(added);
  });
  mo.observe(main, { childList: true, subtree: true });

  // hero photo settle (1.03 -> 1) — only while the hero is on screen and the
  // page just loaded (the lazy phase normally lands well inside this window)
  const heroImg = main.querySelector('.hero img');
  if (heroImg && performance.now() < 3000) {
    const rect = heroImg.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      heroImg.classList.add('mo-hero');
      // flush the initial scale into the render tree, then settle
      // (a one-time read at init — never in a scroll path)
      // eslint-disable-next-line no-unused-expressions
      heroImg.offsetWidth;
      heroImg.classList.add('mo-hero-settle');
    }
  }

  // if the OS preference flips mid-session, go fully inert and visible
  const onPreferenceChange = () => {
    if (!reduce.matches) return;
    io.disconnect();
    mo.disconnect();
    document.documentElement.classList.remove('motion-ok');
  };
  if (reduce.addEventListener) reduce.addEventListener('change', onPreferenceChange);
}
