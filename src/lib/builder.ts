// Lecture des contenus Builder.io au moment de la construction du site (aucun appel côté visiteur).
// En cas d'indisponibilité de Builder.io, le site se construit avec les contenus de secours
// (src/content-seed), qui sont aussi ceux injectés au départ dans Builder.io.
import sectorsSeed from '../content-seed/sectors.json';
import faqSeed from '../content-seed/faq.json';
import settingsSeed from '../content-seed/site-settings.json';

const PUBLIC_KEY = '61b8020017bc4b33a6d54bd3e667bb03'; // clé publique (lecture seule), sans risque côté client
const API = 'https://cdn.builder.io/api/v3/content';

type Entry<T> = {id: string; name: string; published: string; data: T};

const cache = new Map<string, unknown>();

async function fetchModel<T>(model: string, query = ''): Promise<T[] | null> {
  const key = model + query;
  if (cache.has(key)) return cache.get(key) as T[];
  try {
    const url = `${API}/${model}?apiKey=${PUBLIC_KEY}&limit=100&cachebust=true&noTraverse=false${query}`;
    const res = await fetch(url, {signal: AbortSignal.timeout(15000)});
    if (!res.ok) throw new Error(`Builder ${model} ${res.status}`);
    const json = (await res.json()) as {results: Entry<T>[]};
    const out = json.results.filter((e) => e.published === 'published').map((e) => e.data);
    cache.set(key, out);
    return out;
  } catch (err) {
    console.warn(`[builder] ${model} indisponible, contenu de secours utilisé :`, (err as Error).message);
    return null;
  }
}

export interface Sector {
  slug: string;
  nom: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  enjeux: {titre: string; texte: string}[];
  benefices: {titre: string; texte: string}[];
  recompenses: string[];
  messages: string[];
  carte: {nom: string; activite: string; couleurFond: string; couleurAccent: string; couleurTexte: string; total: number; recompense: string};
  faq: {q: string; a: string}[];
}

export interface FaqItem {
  q: string;
  a: string;
  categorie: string;
  ordre: number;
}

export interface Article {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  date: string;
  readingMinutes: number;
  tags: string[];
  faq?: {q: string; a: string}[];
  body: string;
  cover?: string;
}

export interface SiteSettings {
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
  nomDirigeant: string;
  nomCommercial: string;
  siret: string;
  adresse: string;
  telephone: string;
  appUrl: string;
  billingPortalUrl: string;
  ga4Id?: string;
  /** Codes de vérification Google Search Console et Bing Webmaster Tools (balise meta). */
  googleVerification?: string;
  bingVerification?: string;
  /** Profils officiels de la marque (LinkedIn, Instagram, Facebook…), un par ligne. */
  sameAs?: string;
}

// Les listes Builder (champ « list ») arrivent sous forme d'objets { value } : on les aplatit.
const flat = (v: unknown) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' && 'value' in x ? (x as {value: unknown}).value : x)) : v);

/** Contenus du dépôt complétés par ceux de Builder : à slug égal, la version Builder l'emporte. */
function merge<T extends {slug: string}>(seed: T[], remote: T[] | null): T[] {
  const bySlug = new Map(seed.map((x) => [x.slug, x]));
  for (const x of remote ?? []) if (x?.slug) bySlug.set(x.slug, x);
  return [...bySlug.values()];
}

export async function getSectors(): Promise<Sector[]> {
  const remote = await fetchModel<Sector>('secteur');
  const list = merge(sectorsSeed as Sector[], remote);
  const order = (sectorsSeed as Sector[]).map((s) => s.slug);
  return list
    .map((s) => ({...s, recompenses: flat(s.recompenses) as string[], messages: flat(s.messages) as string[]}))
    .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
}

export async function getFaq(): Promise<FaqItem[]> {
  const remote = await fetchModel<FaqItem>('faq');
  const list = remote && remote.length ? remote : (faqSeed as FaqItem[]);
  return [...list].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

const articleFiles = import.meta.glob<{default: Article}>('../content-seed/articles/*.json', {eager: true});

export async function getArticles(): Promise<Article[]> {
  const remote = await fetchModel<Article>('article');
  const seed = Object.values(articleFiles).map((m) => m.default);
  const list = merge(seed, remote ? remote.map((a) => ({...a, tags: flat(a.tags) as string[]})) : null);
  return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getSettings(): Promise<SiteSettings> {
  const remote = await fetchModel<SiteSettings>('site-settings');
  return {...(settingsSeed as SiteSettings), ...((remote && remote[0]) || {})};
}

/** Pages visuelles créées dans l'éditeur Builder.io (modèle « page »), rendues en HTML statique. */
export async function getBuilderPages(): Promise<{url: string; title: string; description: string; html: string}[]> {
  try {
    const res = await fetch(`${API}/page?apiKey=${PUBLIC_KEY}&limit=100&fields=data.url,data.title,data.description,published`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {results: Entry<{url?: string; title?: string; description?: string}>[]};
    const pages = [];
    for (const p of json.results) {
      const url = p.data.url;
      if (p.published !== 'published' || !url || url === '/') continue;
      const h = await fetch(`https://cdn.builder.io/api/v1/html/page?apiKey=${PUBLIC_KEY}&url=${encodeURIComponent(url)}`);
      if (!h.ok) continue;
      const data = (await h.json()) as {data?: {html?: string}};
      if (data.data?.html) pages.push({url, title: p.data.title || p.name, description: p.data.description || '', html: data.data.html});
    }
    return pages;
  } catch {
    return [];
  }
}
