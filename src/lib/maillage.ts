// Maillage interne : guides proposés sur une page métier, articles « À lire aussi », métiers proches.
// Choix explicites d'abord (relus à la main, d'après le contenu des guides), puis mots-clés du sujet pour un
// article ou un métier ajouté depuis Builder.io sans passer par ce fichier. Jamais de tirage au hasard.
import type {Article, Sector} from './builder';

/** Guides proches de chaque métier, dans l'ordre d'affichage (slugs d'articles). */
export const GUIDES_PAR_METIER: Record<string, string[]> = {
  // « Fidéliser ses clients en salon de coiffure » traite aussi le barbier (section « Coiffeur ou barbier »)
  // « Carte de fidélité papier » a un exemple de carte de coiffure (requête « carte de fidélité coiffure », Haloscan 2026-10-29)
  'coiffeur-barbier': ['fideliser-clients-salon-coiffure', 'carte-de-fidelite-papier-modele', 'idees-recompenses-carte-fidelite'],
  barbier: ['fideliser-clients-salon-coiffure', 'idees-recompenses-carte-fidelite', 'relancer-clients-inactifs'],
  // « 30 idées de récompenses » a une section « Instituts de beauté et ongleries »
  // « Programme de fidélité » présente les niveaux VIP, conseillés aux instituts dans son tableau par métier
  'institut-onglerie': ['idees-recompenses-carte-fidelite', 'programme-de-fidelite-commerce', 'relancer-clients-inactifs'],
  onglerie: ['idees-recompenses-carte-fidelite', 'relancer-clients-inactifs', 'creer-carte-de-fidelite'],
  // section « Snacks, pizzerias et restauration rapide » ; le comparatif papier / digitale parle du rush au comptoir
  'restauration-rapide': ['idees-recompenses-carte-fidelite', 'carte-fidelite-papier-ou-digitale', 'relancer-clients-inactifs'],
  pizzeria: ['idees-recompenses-carte-fidelite', 'carte-fidelite-papier-ou-digitale', 'creer-carte-de-fidelite'],
  sushi: ['idees-recompenses-carte-fidelite', 'relancer-clients-inactifs', 'carte-fidelite-apple-wallet-google-wallet'],
  'boulangerie-cafe': ['idees-recompenses-carte-fidelite', 'carte-fidelite-papier-ou-digitale', 'carte-fidelite-apple-wallet-google-wallet'],
  'commerce-de-proximite': ['creer-carte-de-fidelite', 'carte-fidelite-papier-ou-digitale', 'idees-recompenses-carte-fidelite'],
  restaurant: ['idees-recompenses-carte-fidelite', 'relancer-clients-inactifs', 'creer-carte-de-fidelite'],
  fleuriste: ['idees-recompenses-carte-fidelite', 'relancer-clients-inactifs', 'creer-carte-de-fidelite'],
  'boucherie-traiteur': ['idees-recompenses-carte-fidelite', 'creer-carte-de-fidelite', 'carte-fidelite-papier-ou-digitale'],
  pressing: ['idees-recompenses-carte-fidelite', 'relancer-clients-inactifs', 'carte-fidelite-papier-ou-digitale'],
};

/** Métiers voisins, montrés en premier dans « Les autres métiers » (même clientèle ou même rythme de visites). */
export const METIERS_PROCHES: Record<string, string[]> = {
  'coiffeur-barbier': ['barbier', 'institut-onglerie', 'onglerie'],
  barbier: ['coiffeur-barbier'],
  'institut-onglerie': ['onglerie', 'coiffeur-barbier'],
  onglerie: ['institut-onglerie', 'coiffeur-barbier'],
  'restauration-rapide': ['pizzeria', 'sushi', 'restaurant'],
  pizzeria: ['restauration-rapide', 'restaurant', 'sushi'],
  sushi: ['restaurant', 'restauration-rapide', 'pizzeria'],
  restaurant: ['pizzeria', 'sushi', 'restauration-rapide'],
  'boulangerie-cafe': ['commerce-de-proximite', 'restauration-rapide'],
  'commerce-de-proximite': ['fleuriste', 'boucherie-traiteur', 'pressing'],
  fleuriste: ['commerce-de-proximite'],
  'boucherie-traiteur': ['commerce-de-proximite', 'restaurant'],
  pressing: ['commerce-de-proximite'],
};

// Guides généraux, en complément quand un métier a peu de guides propres
const GUIDES_GENERAUX = ['idees-recompenses-carte-fidelite', 'creer-carte-de-fidelite', 'programme-de-fidelite-commerce', 'carte-de-fidelite-digitale-guide', 'application-carte-de-fidelite'];

// Mots trop courants sur ce site pour dire de quoi parle un article
const COURANTS = new Set(['carte', 'cartes', 'fidelite', 'fidelisation', 'digitale', 'programme', 'commerce', 'commercant', 'clients', 'client', 'comment', 'guide', 'complet', 'idees', 'votre', 'pour', 'avec', 'sans', 'dans']);

const simplifier = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Racines des mots significatifs d'un texte (5 premières lettres, mots d'au moins 4 lettres). */
function racines(texte: string): Set<string> {
  const mots = simplifier(texte).split(/[^a-z]+/).filter((m) => m.length >= 4 && !COURANTS.has(m));
  return new Set(mots.map((m) => m.slice(0, 5)));
}

/** Articles cités par un article (liens /blog/<slug> de son texte). */
function liensVers(a: Article): Set<string> {
  return new Set([...a.body.matchAll(/href="\/blog\/([a-z0-9-]+)/g)].map((m) => m[1]));
}

/**
 * Guides pour une page métier : la liste explicite de GUIDES_PAR_METIER, sinon les articles qui parlent le plus de
 * ce métier (nom et slug du métier retrouvés dans le titre, les mots-clés et le texte), complétés par les guides
 * généraux.
 */
export function guidesPourMetier(s: Sector, articles: Article[], n = 3): Article[] {
  const parSlug = new Map(articles.map((a) => [a.slug, a]));
  const choisis = (GUIDES_PAR_METIER[s.slug] ?? []).map((slug) => parSlug.get(slug)).filter((a): a is Article => !!a);
  if (choisis.length < n) {
    const cles = racines(`${s.slug.replace(/-/g, ' ')} ${s.nom}`);
    const score = (a: Article) => {
      const titre = racines(`${a.title} ${a.tags.join(' ')}`);
      const texte = simplifier(a.body.replace(/<[^>]+>/g, ' '));
      let total = 0;
      for (const c of cles) total += (titre.has(c) ? 3 : 0) + texte.split(c).length - 1;
      return total;
    };
    const restants = articles
      .filter((a) => !choisis.includes(a))
      .map((a) => ({a, score: score(a), general: GUIDES_GENERAUX.indexOf(a.slug)}))
      .filter((x) => x.score > 0 || x.general >= 0)
      .sort((x, y) => y.score - x.score || (x.general < 0 ? 99 : x.general) - (y.general < 0 ? 99 : y.general));
    choisis.push(...restants.map((x) => x.a));
  }
  return choisis.slice(0, n);
}

/** Mots-clés (tags) qui disent le sujet : « carte de fidélité » ou « programme de fidélité » ne comptent pas. */
const tagsDuSujet = (a: Article) => new Set(a.tags.map(simplifier).filter((t) => racines(t).size > 0));

/**
 * « À lire aussi » : les articles les plus proches par le sujet. Mots-clés (tags) en commun, racines communes du
 * titre et des mots-clés, et liens entre les deux articles ; à égalité, les guides généraux, puis l'ordre de la
 * liste (le plus récent d'abord).
 */
export function articlesProches(a: Article, articles: Article[], n = 3): Article[] {
  const tags = tagsDuSujet(a);
  const sujet = racines(`${a.title} ${a.tags.join(' ')}`);
  const cites = liensVers(a);
  const rangGeneral = (o: Article) => (GUIDES_GENERAUX.includes(o.slug) ? GUIDES_GENERAUX.indexOf(o.slug) : GUIDES_GENERAUX.length);
  return articles
    .filter((o) => o.slug !== a.slug)
    .map((o, i) => {
      let score = [...tagsDuSujet(o)].filter((t) => tags.has(t)).length * 3;
      for (const r of racines(`${o.title} ${o.tags.join(' ')}`)) if (sujet.has(r)) score += 1;
      if (cites.has(o.slug)) score += 2;
      if (liensVers(o).has(a.slug)) score += 1;
      return {o, score, i};
    })
    .sort((x, y) => y.score - x.score || rangGeneral(x.o) - rangGeneral(y.o) || x.i - y.i)
    .slice(0, n)
    .map((x) => x.o);
}

/** Les autres métiers, les plus proches en premier, puis dans l'ordre habituel. */
export function autresMetiers(s: Sector, sectors: Sector[]): Sector[] {
  const proches = METIERS_PROCHES[s.slug] ?? [];
  const rang = (o: Sector) => (proches.includes(o.slug) ? proches.indexOf(o.slug) : proches.length + sectors.indexOf(o));
  return sectors.filter((o) => o.slug !== s.slug).sort((x, y) => rang(x) - rang(y));
}
