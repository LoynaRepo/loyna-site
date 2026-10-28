// Mail perso après un appel (bouton « Envoyer mail perso » de la fiche d'un prospect, demande d'Ewan du 2026-10-27).
// Règles sans dépendance d'interface (testées par tools/commercial/test_mail_perso.mjs, qui les compare au coffre) :
//   - la note chiffrée « [MAIL] {json} » que le panel enregistre, et que le coffre traite (_systeme/mail_perso.py :
//     contrôles, visuel, envoi par loyna_mail.py) ;
//   - l'aperçu du mail, rempli comme le vrai : même modèle (« 03 Modèles/Mail perso après appel.md », reçu dans les
//     données du panel) et mêmes champs que mail_perso.contexte(). Toute modification se fait des deux côtés.
import {PLANS, visuelActivite, type PlanId} from '../data/site';
import type {Note} from './notes-crypto';
import type {Prospect} from './types';

export const MARQUE_MAIL = '[MAIL]';
export const LIGNES_MAX = 6; // récapitulatif : une puce par ligne
const RE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/; // même syntaxe que loyna_mail.RE_EMAIL
const STATUTS_EXCLUS = ['refus', 'stop', 'hors cible'];

export type Offre = '' | PlanId;
export interface DemandeMail {
  v: 1;
  to: string;
  objet: string;
  prenom: string;
  recap: string;
  offre: Offre;
  etape: string;
  activite: string;
  recompense: string;
  fond: string; // #rrggbb
  tampons: string;
  ambiance: string;
  signataire: string;
}

export const estNoteMail = (n: Pick<Note, 'texte'>) => n.texte.trimStart().toUpperCase().startsWith(MARQUE_MAIL);
export const emailValide = (e: string) => RE_EMAIL.test(e.trim());

/** Bouton visible : adresse à la syntaxe valide (modifiable ensuite) et prospect encore joignable. */
export const boutonVisible = (p: Pick<Prospect, 'email' | 'statut'>) => emailValide(p.email || '') && !STATUTS_EXCLUS.includes((p.statut || '').trim().toLowerCase());

/** Texte de la note (4 000 caractères au plus, limite des notes du panel). */
export const texteNoteMail = (d: DemandeMail) => `${MARQUE_MAIL} ${JSON.stringify(d)}`;

export function lireNoteMail(n: Pick<Note, 'texte'>): DemandeMail | null {
  if (!estNoteMail(n)) return null;
  try {
    const d = JSON.parse(n.texte.trimStart().slice(MARQUE_MAIL.length).trim());
    return d && typeof d === 'object' ? (d as DemandeMail) : null;
  } catch {
    return null;
  }
}

/** Une puce par ligne non vide, telle que tapée (seuls les tirets ou puces de début de ligne sont retirés). */
export const lignesRecap = (texte: string) =>
  (texte || '')
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^\s*[-–—•*·]\s*/, '').trim())
    .filter(Boolean);

const CIVILITES = /^(m|mme|mlle|mr|monsieur|madame|sarl|sas|sasu|eurl|ei|sci|ste|société)\.?$/i;
/** Prénom prérempli : celui de la fiche, sinon le premier mot du dirigeant s'il ressemble à un prénom. */
export function prenomPour(p: Pick<Prospect, 'prenom' | 'dirigeant'>): string {
  if (p.prenom?.trim()) return p.prenom.trim();
  const premier = (p.dirigeant || '').trim().split(/\s+/)[0] || '';
  return /^[A-ZÀ-Ý][a-zà-ÿ'-]+$/.test(premier) && !CIVILITES.test(premier) ? premier : '';
}

/** Valeurs de départ du compositeur pour ce prospect. */
export function demandeInitiale(p: Prospect, signataire: string): DemandeMail {
  const a = visuelActivite(p.activite_carte || 'Autre');
  return {
    v: 1,
    to: p.email || '',
    objet: '',
    prenom: prenomPour(p),
    recap: '',
    offre: '',
    etape: '',
    activite: a.nom,
    recompense: a.recompense,
    fond: a.fond,
    tampons: a.tampons,
    ambiance: a.ambiance,
    signataire: signataire || 'Ewan',
  };
}

/** Nouvelle activité : sa récompense et ses couleurs (fond, tampons et ambiance du visuel). */
export function avecActivite(d: DemandeMail, activite: string): DemandeMail {
  const a = visuelActivite(activite);
  return {...d, activite: a.nom, recompense: a.recompense, fond: a.fond, tampons: a.tampons, ambiance: a.ambiance};
}

/** Contrôles avant l'enregistrement ; renvoie le premier problème, ou ''. */
export function probleme(d: DemandeMail): string {
  if (!emailValide(d.to)) return 'Adresse e-mail invalide : vérifiez le champ « À ».';
  const n = lignesRecap(d.recap).length;
  if (!n) return 'Tapez le récapitulatif de l’appel : une ligne par point.';
  if (n > LIGNES_MAX) return `Récapitulatif trop long : ${LIGNES_MAX} lignes au plus (il en a ${n}).`;
  if (!d.signataire.trim()) return 'Indiquez qui signe le mail.';
  if (texteNoteMail(d).length > 4000) return 'Trop de texte pour une seule note (4 000 caractères au plus) : raccourcissez le récapitulatif.';
  return '';
}

// --- Aperçu du mail : mêmes champs que mail_perso.contexte() du coffre ------------------------------------------

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const une = (s: string, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const hexa = (v: string) => {
  const h = (v || '').trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) ? h : '';
};
/** Comme quote() de Python (urlencode des liens du coffre) : seuls lettres, chiffres et « _.-~ » restent tels quels. */
const coder = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const requete = (params: [string, string][]) => params.map(([k, v]) => `${k}=${coder(v)}`).join('&');

/** Prix mensuel affiché comme documents_client.euros(x, False) : « 29 € », « 39,99 € ». */
export function prixMensuel(offre: Offre): string {
  const p = PLANS.find((x) => x.id === offre);
  if (!p) return '';
  const n = Number.isInteger(p.monthly) ? String(p.monthly) : p.monthly.toFixed(2).replace('.', ',');
  return `${n} €`;
}

export function lienConfigurateur(nom: string, d: DemandeMail): string {
  const params: [string, string][] = [['nom', nom.slice(0, 40)], ['activite', une(d.activite, 40) || 'Autre']];
  if (une(d.recompense, 40)) params.push(['recompense', une(d.recompense, 40)]);
  if (hexa(d.fond) && hexa(d.tampons)) params.push(['fond', hexa(d.fond)], ['tampons', hexa(d.tampons)]);
  return `https://loyna.fr/creer-ma-carte/?${requete(params)}`;
}

/** Paramètres de la page /visuel-carte/ (aperçu du panel ; le coffre capture la même page). */
export function paramsVisuel(nom: string, ville: string, d: DemandeMail): string {
  const params: [string, string][] = [
    ['nom', nom.slice(0, 60)],
    ['activite', une(d.activite, 40) || 'Autre'],
    ['recompense', une(d.recompense, 40)],
    ['fond', hexa(d.fond)],
    ['tampons', hexa(d.tampons)],
    ['ambiance', hexa(d.ambiance)],
    ['ville', une(ville, 40)],
  ];
  return requete(params.filter(([, v]) => v));
}

export type Contexte = Record<string, string | {texte: string}[]>;

export function contexteMail(nom: string, d: DemandeMail, demandeLe?: Date, auj = new Date()): Contexte {
  const signataire = une(d.signataire, 40) || 'Ewan';
  const ewan = signataire.toLowerCase() === 'ewan';
  const prenom = une(d.prenom, 40);
  const memeJour = !demandeLe || demandeLe.toDateString() === auj.toDateString();
  const offre = PLANS.find((x) => x.id === d.offre);
  const etape = une(d.etape, 200);
  return {
    nom,
    bonjour: prenom ? `Bonjour ${prenom},` : 'Bonjour,',
    echange: memeJour ? 'de ce jour' : `du ${demandeLe!.getDate() === 1 ? '1er' : demandeLe!.getDate()} ${MOIS[demandeLe!.getMonth()]}`,
    puces: lignesRecap(d.recap)
      .slice(0, 20)
      .map((texte) => ({texte})),
    offre: offre ? `LOYNA ${offre.name}` : '',
    prix: offre ? prixMensuel(offre.id) : '',
    etape: etape && !/[.!?…]$/.test(etape) ? `${etape}.` : etape,
    lien_configurateur: lienConfigurateur(nom, d),
    alt_visuel: `Aperçu de la carte de fidélité de ${nom}`,
    signataire: ewan ? 'Ewan' : signataire,
    signature_ligne2: ewan ? 'Fondateur de LOYNA' : 'LOYNA',
  };
}

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** Mini-moteur de documents_client.rendre() : {{x}} échappé, {{{x}}} brut, {{#x}}…{{/x}} (si x, ou boucle), {{^x}}…{{/x}}. */
export function rendreModele(modele: string, ctx: Contexte): string {
  const val = (c: Contexte, k: string) => c[k];
  let s = modele.replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_m, genre: string, cle: string, interieur: string) => {
    const v = val(ctx, cle);
    if (genre === '^') return !v || (Array.isArray(v) && !v.length) ? rendreModele(interieur, ctx) : '';
    if (Array.isArray(v)) return v.map((el) => rendreModele(interieur, {...ctx, ...el})).join('');
    return v ? rendreModele(interieur, ctx) : '';
  });
  s = s.replace(/\{\{\{(\w+)\}\}\}/g, (_m, k: string) => String(val(ctx, k) ?? ''));
  return s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => echapper(String(val(ctx, k) ?? '')));
}

const desechapper = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Objet et HTML du mail, comme mail_perso.construire() (sections vides : pas de ligne blanche). */
export function construireMail(modele: {objet: string; html: string}, nom: string, d: DemandeMail, demandeLe?: Date, auj?: Date) {
  const ctx = contexteMail(nom, d, demandeLe, auj);
  const objet = une(d.objet, 150) || desechapper(rendreModele(modele.objet, ctx));
  const html = rendreModele(modele.html, ctx).replace(/\n\s*\n/g, '\n').trim();
  return {objet, html};
}

/** Objet proposé par défaut (modèle du coffre, sinon la même phrase). */
export const objetParDefaut = (modele: {objet: string} | null | undefined, nom: string) =>
  modele ? desechapper(rendreModele(modele.objet, {nom})) : `Suite à notre échange – ${nom}`;
