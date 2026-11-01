// Règles communes au panier et à l'essai (/panier/, /essai/) : mot de passe du compte LOYNA, adresse e-mail, code de parrainage.

// Règles de mot de passe de l'espace client (Supabase Auth, comme la page « Choisir mon mot de passe »)
export const RULES = [
  {test: (p: string) => p.length >= 10, label: '10 caractères minimum'},
  {test: (p: string) => /[A-Z]/.test(p), label: 'une majuscule'},
  {test: (p: string) => /[a-z]/.test(p), label: 'une minuscule'},
  {test: (p: string) => /\d/.test(p), label: 'un chiffre'},
];
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const TELEPHONE_RE = /^[0-9+ ().-]{8,30}$/;
/** Essai : numéro français, métropole ou outre-mer avec l'indicatif (contrôlé aussi par la fonction trial, FRENCH_PHONE). */
export const telephoneFrancais = (v: string) => /^(?:0[1-9]\d{8}|(?:\+|00)33(?:0?[1-9])\d{8}|(?:\+|00)(?:262|590|594|596)\d{9})$/.test(v.replace(/[\s.()-]/g, ''));

// Parrainage LOYNA : « LOYNA- » + 6 caractères sans 0, O, 1 ni I (comme le serveur, _shared/referral.ts)
const REFERRAL_RE = /^LOYNA-[A-HJ-NP-Z2-9]{6}$/;
export function normalizeReferral(value: string): string | null {
  const raw = value.toUpperCase().replace(/[\s_.-]+/g, '');
  const code = `LOYNA-${raw.startsWith('LOYNA') ? raw.slice(5) : raw}`;
  return REFERRAL_RE.test(code) ? code : null;
}
export const REFERRAL_ERRORS = new Set(['REFERRAL_INVALID', 'REFERRAL_SELF', 'REFERRAL_NOT_NEW', 'REFERRAL_ALREADY']);

/** Mesure d'audience : rien ne part sans le consentement du visiteur (Consent.astro). */
export const track = (name: string, params: object) => (window as unknown as {loynaTrack?: (n: string, p?: object) => void}).loynaTrack?.(name, params);

/** Lecture et écriture du stockage du navigateur, sans erreur en navigation privée. */
export function store(kind: 'local' | 'session', key: string, value?: string | null): string | null {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée) */
  }
  return null;
}

/** Logo du configurateur (/creer-ma-carte/), gardé pour l'essai dans cet onglet : voir logoToFiles (src/app/logo-png.ts). */
export const CLE_LOGO = 'loyna-config-logo';
export interface LogoGarde {
  logo_png: string;
  icon_png: string;
  nom: string; // nom du fichier choisi
}
export function lireLogoGarde(): LogoGarde | null {
  try {
    const l = JSON.parse(store('session', CLE_LOGO) || 'null');
    return l && typeof l.logo_png === 'string' && typeof l.icon_png === 'string' ? l : null;
  } catch {
    return null;
  }
}
export const urlLogo = (l: {logo_png: string} | null) => (l ? `data:image/png;base64,${l.logo_png}` : null);

/** Résultats de la recherche d'établissements (API publique recherche-entreprises.api.gouv.fr) : établissements ouverts seulement. */
export interface Etablissement {
  nom: string;
  adresse: string;
  siret: string;
}
export async function chercherEtablissements(texte: string, signal?: AbortSignal): Promise<Etablissement[]> {
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(texte)}&per_page=8`;
  const r = await fetch(url, {headers: {Accept: 'application/json'}, signal});
  if (!r.ok) throw new Error('recherche indisponible');
  const d = await r.json();
  const liste: Etablissement[] = [];
  for (const e of d?.results ?? []) {
    const lieux = e.matching_etablissements?.length ? e.matching_etablissements : e.siege ? [e.siege] : [];
    for (const l of lieux) {
      if (l?.siret && l.etat_administratif === 'A') {
        const enseigne = Array.isArray(l.liste_enseignes) && l.liste_enseignes[0] ? ` (${l.liste_enseignes[0]})` : '';
        liste.push({nom: `${e.nom_complet ?? ''}${enseigne}`.trim(), adresse: l.adresse ?? '', siret: l.siret});
      }
    }
  }
  return liste.slice(0, 8);
}

/** SIRET : 14 chiffres et clé de Luhn, comme le serveur (_shared/siret.ts). */
export function siretValide(valeur: string): boolean {
  const s = valeur.replace(/\s/g, '');
  if (!/^\d{14}$/.test(s)) return false;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let c = Number(s[13 - i]);
    if (i % 2 === 1) {
      c *= 2;
      if (c > 9) c -= 9;
    }
    somme += c;
  }
  return somme % 10 === 0;
}
