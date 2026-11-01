// Carte préparée avec un commerçant depuis le panel commercial (Ewan, 2026-10-30) : réglages, logo et offre, rangés par
// /espace-commercial/cartes.php et repris par le lien du panier (/panier/?carte=<id>), par celui de l'essai
// (/essai/?carte=<id>) et par l'écran Opérateur. Ni contact ni e-mail : seulement ce qui figure sur la carte et l'offre choisie.
import type {Engagement} from '../data/site';

export const ADRESSE_CARTES = '/espace-commercial/cartes.php';
export const RE_ID_CARTE = /^[a-z0-9]{16}$/;

export interface CartePreparee {
  nom: string;
  activite: string;
  recompense: string;
  fond: string; // #rrggbb
  tampons: string; // #rrggbb
  passages: number;
  logo: string | null; // data:image/png;base64,…
  /** starter ou pro ; les anciennes fiches peuvent valoir premium : toujours lire par normalizeOffer(c.offre, c.periode, c.engagement). */
  offre: string;
  engagement?: Engagement;
  /** Anciennes fiches seulement : mensuel ou annuel. */
  periode?: string;
  qr: {unit: number; pack5: number; pack10: number};
  prospect?: string; // identifiant de la fiche du panel (jamais renvoyé par la lecture publique)
}

/** Carte du lien (lecture publique), ou null si le lien ne correspond à aucune carte. */
export async function lireCartePreparee(id: string): Promise<CartePreparee | null> {
  if (!RE_ID_CARTE.test(id)) return null;
  const r = await fetch(`${ADRESSE_CARTES}?id=${id}`, {headers: {Accept: 'application/json'}, cache: 'no-store'});
  if (!r.ok) return null;
  const d = await r.json();
  return d?.carte ?? null;
}

/** Identifiant dans un lien collé (https://loyna.fr/panier/?carte=…, /essai/?carte=…) ou l'identifiant seul. */
export function idDuLien(texte: string): string | null {
  const t = texte.trim();
  const m = /[?&]carte=([a-z0-9]{16})\b/.exec(t);
  const id = m ? m[1] : t;
  return RE_ID_CARTE.test(id) ? id : null;
}

export const lienCarte = (id: string, origine = 'https://loyna.fr') => `${origine}/panier/?carte=${id}`;
export const lienEssaiCarte = (id: string, origine = 'https://loyna.fr') => `${origine}/essai/?carte=${id}`;
