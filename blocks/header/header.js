/**
 * header — Clover corporate chrome + "The Green" blog band.
 *
 * Reproduces the captured blog.clover.com chrome (chromePolicy:
 * verbatim-copy). The corporate vertical links (Restaurants, Services, …)
 * open a full-height LEFT SLIDE-IN offcanvas panel — the original site's
 * uikit offcanvas (#drawer-widget) pattern: overlay, close button,
 * aria-modal dialog, focus trap, Escape/overlay-click close, body scroll
 * lock, ~250ms ease-out slide. On mobile the hamburger opens the same
 * offcanvas with an accordion menu (the original's #offcanvas). The green
 * blog band keeps its click-to-open dropdowns (the original uses uk-dropdown
 * there, not the offcanvas).
 *
 * Content comes from the /nav document: section 1 = logo, section 2 =
 * corporate verticals (nested lists), section 3 = utility links,
 * section 4 = blog band (brand + dropdown lists). The blog-band search
 * submits to /search?q= (search block).
 */
import { getMetadata } from '../../scripts/aem.js';
import { t as tr } from '../../scripts/i18n.js';
import { loadFragment } from '../fragment/fragment.js';

const CLOSE_SVG = '<svg width="17" height="17" viewBox="0 0 14 14" aria-hidden="true"><line fill="none" stroke="currentColor" stroke-width="1.1" x1="1" y1="1" x2="13" y2="13"></line><line fill="none" stroke="currentColor" stroke-width="1.1" x1="13" y1="1" x2="1" y2="13"></line></svg>';
const CHEVRON_SVG = '<svg class="green-chevron" width="13" height="10" viewBox="0 0 13 10" aria-hidden="true" focusable="false"><polygon fill="currentColor" points="0.5,1 12.5,1 6.5,9"></polygon></svg>';

/** hover-open only where a real hover exists — touch gets first-tap toggle */
const canHover = window.matchMedia('(hover: hover)');
const HOVER_CLOSE_DELAY = 150;

function directText(li) {
  return [...li.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE || (n.nodeType === 1 && n.tagName !== 'UL'))
    .map((n) => n.textContent)
    .join('')
    .trim();
}

function closeAllDrops(scope) {
  scope.querySelectorAll('.nav-drop > button[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
  });
}

let dropId = 0;

/**
 * turns a <li> with a nested <ul> into a hover/focus-driven dropdown item.
 * First-level items are BUTTONS (never links): hover opens with a small
 * close delay (diagonal mouse travel), keyboard focus/Enter/Space opens,
 * tabbing through the submenu keeps it open (focus stays inside the item),
 * Escape closes and restores focus, and on touch (no hover) the first tap
 * toggles. A chevron after the label rotates 180° while open.
 */
function buildDrop(li, panelBuilder, panelClass) {
  const item = document.createElement('li');
  item.className = 'nav-drop';
  dropId += 1;
  const id = `nav-drop-${dropId}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-controls', id);
  const label = document.createElement('span');
  label.className = 'nav-drop-label';
  label.textContent = directText(li);
  toggle.append(label);
  toggle.insertAdjacentHTML('afterbegin', CHEVRON_SVG);

  const panel = document.createElement('div');
  panel.className = panelClass;
  panel.id = id;
  panelBuilder(li.querySelector(':scope > ul'), panel);

  const setOpen = (open) => {
    if (open) closeAllDrops(toggle.closest('.header') || document);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  // click = keyboard Enter/Space + touch first tap (toggle)
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // keyboard focus opens (mouse/touch focus is not :focus-visible)
  toggle.addEventListener('focus', () => {
    if (toggle.matches(':focus-visible')) setOpen(true);
  });

  // hover open/close with a short close delay; hovering the panel (inside
  // the item) cancels the pending close, so the submenu stays open
  let hoverCloseTimer = null;
  item.addEventListener('mouseenter', () => {
    if (!canHover.matches) return;
    if (hoverCloseTimer) {
      clearTimeout(hoverCloseTimer);
      hoverCloseTimer = null;
    }
    setOpen(true);
  });
  item.addEventListener('mouseleave', () => {
    if (!canHover.matches) return;
    hoverCloseTimer = setTimeout(() => {
      toggle.setAttribute('aria-expanded', 'false');
      hoverCloseTimer = null;
    }, HOVER_CLOSE_DELAY);
  });

  // keyboard: tabbing OUT of the item closes it (focus-within keeps it open)
  item.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !item.contains(e.relatedTarget)) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });

  item.append(toggle, panel);
  return item;
}

/** corporate mega panel: groups (subtitle + links) or flat links */
function buildMegaPanel(ul, panel) {
  if (!ul) return;
  [...ul.children].forEach((groupLi) => {
    const subUl = groupLi.querySelector(':scope > ul');
    if (subUl) {
      const group = document.createElement('div');
      group.className = 'nav-group';
      const subtitle = document.createElement('p');
      subtitle.className = 'nav-subtitle';
      subtitle.textContent = directText(groupLi);
      group.append(subtitle, subUl);
      panel.append(group);
    } else {
      let flat = panel.querySelector(':scope > ul.nav-flat');
      if (!flat) {
        flat = document.createElement('ul');
        flat.className = 'nav-flat';
        panel.append(flat);
      }
      flat.append(groupLi);
    }
  });
}

/** blog-band panel: flat link list */
function buildListPanel(ul, panel) {
  if (ul) panel.append(ul);
}

export default async function decorate(block) {
  // locale trees carry their own chrome: /ca/* -> /ca/nav, /ca-fr/* -> /ca-fr/nav.
  // An explicit `nav` metadata still wins; otherwise the default is prefixed by
  // the page's locale so a Canadian page never loads the US nav.
  const localePrefix = (window.location.pathname.match(/^\/(?:ca|ca-fr)(?=\/|$)/) || [''])[0];
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : `${localePrefix}/nav`;
  const fragment = await loadFragment(navPath);
  const sections = [...fragment.querySelectorAll(':scope > div')];
  const [brandSection, menuSection, utilitySection, blogSection] = sections;

  block.textContent = '';

  /* ---- corporate bar ---- */
  const corporate = document.createElement('nav');
  corporate.className = 'nav-corporate';
  corporate.setAttribute('aria-label', 'Clover');
  const corporateInner = document.createElement('div');
  corporateInner.className = 'nav-corporate-inner';

  // hamburger (mobile)
  const hamburger = document.createElement('button');
  hamburger.className = 'nav-hamburger';
  hamburger.type = 'button';
  hamburger.setAttribute('aria-controls', 'nav-offcanvas');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-label', 'Open menu');
  hamburger.innerHTML = '<span></span><span></span><span></span>';

  // logo
  const brand = document.createElement('div');
  brand.className = 'nav-brand';
  const brandLink = brandSection?.querySelector('a');
  const brandImg = brandSection?.querySelector('picture, img');
  if (brandLink) {
    brandLink.className = 'nav-logo';
    brandLink.textContent = '';
    if (brandImg) brandLink.append(brandImg);
    brand.append(brandLink);
  }

  /* ---- corporate verticals → offcanvas toggles + panels ---- */
  const verticals = [...(menuSection?.querySelectorAll(':scope > div > ul > li') || [])];
  const labels = verticals.map((li) => directText(li));

  const menus = document.createElement('ul');
  menus.className = 'nav-menus';
  const toggles = [];
  const panels = [];

  verticals.forEach((li, i) => {
    const item = document.createElement('li');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-oc-toggle';
    toggle.textContent = labels[i];
    toggle.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-controls', 'nav-offcanvas');
    toggle.setAttribute('aria-expanded', 'false');
    item.append(toggle);
    menus.append(item);
    toggles.push(toggle);

    const panel = document.createElement('div');
    panel.className = 'nav-oc-panel';
    buildMegaPanel(li.querySelector(':scope > ul'), panel);
    panels.push(panel);
  });

  // utility links
  const utility = document.createElement('ul');
  utility.className = 'nav-utility';
  utilitySection?.querySelectorAll(':scope a').forEach((a) => {
    const li = document.createElement('li');
    a.classList.remove('button', 'primary', 'secondary');
    if (a.href.includes('connect.clover.com')) li.className = 'feature-btn';
    if (a.querySelector('img, picture')) li.classList.add('nav-cart');
    li.append(a);
    utility.append(li);
  });

  corporateInner.append(hamburger, brand, menus, utility);
  corporate.append(corporateInner);

  /* ---- offcanvas (left slide-in panel, original uikit pattern) ---- */
  const offcanvas = document.createElement('div');
  offcanvas.className = 'nav-offcanvas';
  offcanvas.id = 'nav-offcanvas';
  offcanvas.hidden = true;

  const overlay = document.createElement('div');
  overlay.className = 'nav-offcanvas-overlay';

  const bar = document.createElement('div');
  bar.className = 'nav-offcanvas-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-modal', 'true');
  bar.setAttribute('aria-label', 'Menu');
  bar.tabIndex = -1;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'nav-offcanvas-close';
  closeBtn.setAttribute('aria-label', 'Close menu');
  closeBtn.innerHTML = CLOSE_SVG;

  // desktop: one switched panel per vertical
  const desktop = document.createElement('div');
  desktop.className = 'nav-oc-desktop';
  panels.forEach((p) => desktop.append(p));

  // mobile: accordion of all verticals + utility links (original #offcanvas)
  const mobile = document.createElement('div');
  mobile.className = 'nav-oc-mobile';
  const mobileHeading = document.createElement('p');
  mobileHeading.className = 'nav-oc-heading';
  mobileHeading.textContent = 'Main Menu';
  mobile.append(mobileHeading);
  verticals.forEach((li, i) => {
    const acc = document.createElement('div');
    acc.className = 'nav-oc-acc';
    dropId += 1;
    const accId = `nav-acc-${dropId}`;
    const accBtn = document.createElement('button');
    accBtn.type = 'button';
    accBtn.textContent = labels[i];
    accBtn.setAttribute('aria-expanded', 'false');
    accBtn.setAttribute('aria-controls', accId);
    const accPanel = document.createElement('div');
    accPanel.className = 'nav-oc-acc-panel';
    accPanel.id = accId;
    accPanel.append(...[...panels[i].childNodes].map((n) => n.cloneNode(true)));
    accBtn.addEventListener('click', () => {
      const expanded = accBtn.getAttribute('aria-expanded') === 'true';
      accBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
    acc.append(accBtn, accPanel);
    mobile.append(acc);
  });
  const mobileUtility = utility.cloneNode(true);
  mobileUtility.className = 'nav-oc-utility';
  mobile.append(mobileUtility);

  bar.append(closeBtn, desktop, mobile);
  offcanvas.append(overlay, bar);

  /* offcanvas state machine */
  let openInvoker = null;
  let closeTimer = null;

  function syncExpanded(activeIndex) {
    toggles.forEach((t, j) => t.setAttribute('aria-expanded', String(j === activeIndex)));
  }

  function showPanel(i) {
    panels.forEach((p, j) => p.classList.toggle('active', j === i));
    bar.setAttribute('aria-label', i >= 0 ? `${labels[i]} menu` : 'Menu');
    syncExpanded(i);
  }

  function openOffcanvas(invoker) {
    openInvoker = invoker;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (offcanvas.hidden) {
      offcanvas.hidden = false;
      // double rAF so the initial (off-screen) frame paints before the slide
      requestAnimationFrame(() => {
        requestAnimationFrame(() => offcanvas.classList.add('is-open'));
      });
      document.body.classList.add('nav-offcanvas-open');
      closeBtn.focus();
    }
  }

  function closeOffcanvas(restoreFocus = true) {
    if (offcanvas.hidden) return;
    offcanvas.classList.remove('is-open');
    showPanel(-1);
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-offcanvas-open');
    closeTimer = setTimeout(() => {
      offcanvas.hidden = true;
      closeTimer = null;
    }, 300);
    if (restoreFocus && openInvoker) openInvoker.focus();
    openInvoker = null;
  }

  toggles.forEach((toggle, i) => {
    toggle.addEventListener('click', () => {
      const isActive = panels[i].classList.contains('active') && !offcanvas.hidden;
      if (isActive) {
        closeOffcanvas();
        return;
      }
      showPanel(i);
      openOffcanvas(toggle);
      openInvoker = toggle;
    });
  });

  hamburger.addEventListener('click', () => {
    if (!offcanvas.hidden) {
      closeOffcanvas();
      return;
    }
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Close menu');
    openOffcanvas(hamburger);
  });

  closeBtn.addEventListener('click', () => closeOffcanvas());
  overlay.addEventListener('click', () => closeOffcanvas());

  // focus trap inside the dialog
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = [...bar.querySelectorAll('a[href], button')]
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---- The Green blog band ---- */
  const green = document.createElement('nav');
  green.className = 'nav-green';
  green.setAttribute('aria-label', 'The Green blog');
  const greenInner = document.createElement('div');
  greenInner.className = 'nav-green-inner';

  const greenBrand = document.createElement('p');
  greenBrand.className = 'green-brand';
  const greenLink = blogSection?.querySelector('p a, h2 a');
  if (greenLink) {
    greenLink.classList.remove('button', 'primary', 'secondary');
    greenBrand.append(greenLink);
  }

  const greenMenus = document.createElement('ul');
  greenMenus.className = 'green-menus';
  blogSection?.querySelectorAll(':scope > div > ul > li').forEach((li) => {
    greenMenus.append(buildDrop(li, buildListPanel, 'green-panel'));
  });

  const search = document.createElement('form');
  search.className = 'green-search';
  // post to the locale's own search page and localize the label/placeholder
  search.action = `${localePrefix}/search`;
  search.method = 'get';
  search.setAttribute('role', 'search');
  const searchLabel = tr('Search the blog');
  search.innerHTML = `
    <span class="green-search-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20"><circle fill="none" stroke="currentColor" stroke-width="1.1" cx="9" cy="9" r="7"></circle><path fill="none" stroke="currentColor" stroke-width="1.1" d="M14,14 L18,18 L14,14 Z"></path></svg>
    </span>
    <label class="green-search-label" for="header-search">${searchLabel}</label>
    <input id="header-search" type="search" name="q" placeholder="${searchLabel}" autocomplete="off">
  `;

  greenInner.append(greenBrand, greenMenus, search);
  green.append(greenInner);

  block.append(corporate, offcanvas, green);

  // close dropdowns on outside click / escape; escape also closes the offcanvas
  document.addEventListener('click', (e) => {
    if (!block.contains(e.target)) closeAllDrops(block);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      // restore focus to the open drop's toggle when focus sits inside it
      // (focus BEFORE closing — the toggle's focus handler re-opens, and the
      // closeAllDrops right after wins, so the drop ends up closed + focused)
      const openToggle = block.querySelector('.nav-drop > button[aria-expanded="true"]');
      if (openToggle && openToggle.parentElement.contains(document.activeElement)) {
        openToggle.focus();
      }
      closeAllDrops(block);
      closeOffcanvas();
    }
  });
}
