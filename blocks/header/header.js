/**
 * header — Clover corporate chrome + "The Green" blog band.
 *
 * Reproduces the captured blog.clover.com chrome (chromePolicy:
 * verbatim-copy) with simplified semantic markup: the uikit offcanvas mega
 * menu becomes accessible click-to-open dropdown panels, and the mobile
 * offcanvas becomes a drawer. Content comes from the /nav document:
 * section 1 = logo, section 2 = corporate verticals (nested lists),
 * section 3 = utility links, section 4 = blog band (brand + dropdown lists).
 * The blog-band search submits to /search?q= (search block).
 */
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

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

/** turns a <li> with a nested <ul> into a click-to-open dropdown item */
function buildDrop(li, panelBuilder, panelClass) {
  const item = document.createElement('li');
  item.className = 'nav-drop';
  dropId += 1;
  const id = `nav-drop-${dropId}`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', id);
  toggle.textContent = directText(li);

  const panel = document.createElement('div');
  panel.className = panelClass;
  panel.id = id;
  panelBuilder(li.querySelector(':scope > ul'), panel);

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    closeAllDrops(toggle.closest('.header'));
    toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
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
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
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
  hamburger.setAttribute('aria-controls', 'nav-drawer');
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

  // vertical menus
  const menus = document.createElement('ul');
  menus.className = 'nav-menus';
  menuSection?.querySelectorAll(':scope > div > ul > li').forEach((li) => {
    menus.append(buildDrop(li, buildMegaPanel, 'nav-panel'));
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

  /* ---- mobile drawer ---- */
  const drawer = document.createElement('div');
  drawer.className = 'nav-drawer';
  drawer.id = 'nav-drawer';
  const drawerMenus = menus.cloneNode(true);
  const drawerUtility = utility.cloneNode(true);
  drawer.append(drawerMenus, drawerUtility);
  drawerMenus.querySelectorAll('.nav-drop > button').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    });
  });
  hamburger.addEventListener('click', () => {
    const expanded = hamburger.getAttribute('aria-expanded') === 'true';
    hamburger.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    hamburger.setAttribute('aria-label', expanded ? 'Open menu' : 'Close menu');
    document.body.classList.toggle('nav-drawer-open', !expanded);
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
  search.action = '/search';
  search.method = 'get';
  search.setAttribute('role', 'search');
  search.innerHTML = `
    <span class="green-search-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20"><circle fill="none" stroke="currentColor" stroke-width="1.1" cx="9" cy="9" r="7"></circle><path fill="none" stroke="currentColor" stroke-width="1.1" d="M14,14 L18,18 L14,14 Z"></path></svg>
    </span>
    <label class="green-search-label" for="header-search">Search the blog</label>
    <input id="header-search" type="search" name="q" placeholder="Search the blog" autocomplete="off">
  `;

  greenInner.append(greenBrand, greenMenus, search);
  green.append(greenInner);

  block.append(corporate, drawer, green);

  // close dropdowns on outside click / escape
  document.addEventListener('click', (e) => {
    if (!block.contains(e.target)) closeAllDrops(block);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') closeAllDrops(block);
  });
}
