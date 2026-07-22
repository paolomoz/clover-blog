/**
 * Minimal locale strings for the dynamic blocks. The migrated site serves
 * three trees: US root (en-US), /ca/* (en-CA) and /ca-fr/* (fr-CA). Only the
 * French tree needs translated UI chrome; en-US / en-CA fall through to the
 * English source string, so their output is unchanged.
 *
 * Usage: t('Load more')  ->  'Voir plus' on /ca-fr/*, 'Load more' elsewhere.
 * Interpolation: t('Showing {n} of {total}', { n, total }) — {name} tokens are
 * replaced from params in both the translated and the fallback string.
 */
const STRINGS = {
  'fr-CA': {
    'Read more': 'Lire la suite',
    'Watch Now': 'Regarder maintenant',
    Featured: 'À la une',
    'Load more': 'Voir plus',
    'Search the blog': 'Rechercher dans le blogue',
    Category: 'Catégorie',
    Topic: 'Sujet',
    Type: 'Type',
    'Filter results': 'Filtrer les résultats',
    'Active filters': 'Filtres actifs',
    'Clear filters': 'Effacer les filtres',
    'Loading the article index…': 'Chargement de l’index des articles…',
    'Loading more results…': 'Chargement d’autres résultats…',
    'More posts about {label}': 'Plus d’articles sur {label}',
    'No results for “{q}”.': 'Aucun résultat pour « {q} ».',
    'No results for the selected filters.': 'Aucun résultat pour les filtres sélectionnés.',
    'Showing {shown} of {total} result{s}{label}': 'Affichage de {shown} sur {total} résultat{s}{label}',
    'Search {n} articles — or browse by category and topic.': 'Rechercher parmi {n} articles — ou parcourir par catégorie et sujet.',
    'for “{q}”': 'pour « {q} »',
  },
};

export function localeOf(path = window.location.pathname) {
  if (/^\/ca-fr(\/|$)/.test(path)) return 'fr-CA';
  if (/^\/ca(\/|$)/.test(path)) return 'en-CA';
  return 'en-US';
}

export function t(en, params) {
  const table = STRINGS[localeOf()];
  let s = (table && table[en]) || en;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : ''));
  }
  return s;
}
