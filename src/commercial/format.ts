// Petits outils d'affichage du panel commercial (français).

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « 2026-10-23 » (ou « 2026-10-23T13:27:35 ») → Date locale, sans décalage de fuseau. */
export function enDate(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

/** « 23 oct. » (année ajoutée si ce n'est pas l'année en cours). */
export function dateCourte(iso: string | null | undefined): string {
  const d = enDate(iso);
  if (!d) return '';
  const an = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${an}`;
}

/** « jeudi 23 octobre 2026 » */
export function dateLongue(iso: string | null | undefined, avecJour = false): string {
  const d = enDate(iso);
  if (!d) return '';
  return `${avecJour ? JOURS[d.getDay()] + ' ' : ''}${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

/** « 23 oct. à 13:27 » */
export function dateHeure(iso: string | null | undefined): string {
  const d = enDate(iso);
  if (!d) return '';
  return `${dateCourte(iso)} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Date ISO complète (notes : « 2026-10-23T12:05:00.000Z ») → « 23 oct. à 14:05 », heure locale. */
export function moment(iso: string | null | undefined): string {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const an = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}${an} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Nombre de jours entre une date et aujourd'hui (positif dans le passé). */
export function joursDepuis(iso: string | null | undefined): number | null {
  const d = enDate(iso);
  if (!d) return null;
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((auj.getTime() - d.getTime()) / 86400000);
}

export function ilYa(iso: string | null | undefined): string {
  const j = joursDepuis(iso);
  if (j === null) return '';
  if (j === 0) return 'aujourd’hui';
  if (j === 1) return 'hier';
  if (j < 0) return `dans ${-j} j`;
  return `il y a ${j} j`;
}

const nf = new Intl.NumberFormat('fr-FR');
export const nombre = (n: number | null | undefined) => (n === null || n === undefined ? '–' : nf.format(n));
export const pourcent = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${nf.format(n)} %`);
export const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

const ef = new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'});
/** « 39,99 € » */
export const euros = (n: number | null | undefined) => (n === null || n === undefined ? '–' : ef.format(n));

/** Typographie française du texte affiché : espace insécable avant « : ; ? ! % € » et dans les guillemets. */
export function fr(s: string | null | undefined): string {
  return (s || '')
    .replace(/ ([:;?!»%€])/g, ' $1')
    .replace(/« /g, '« ')
    .replace(/(\d) (\d{3})\b/g, '$1 $2');
}

/** Clé de recherche : minuscules, sans accents. */
export function cle(s: string | null | undefined): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Lien sûr : seulement http(s), jamais javascript: ou data:. */
export function lienSur(url: string | null | undefined): string | null {
  const u = (url || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
}

export function lienMail(email: string | null | undefined): string | null {
  const e = (email || '').trim();
  return /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e) ? `mailto:${e}` : null;
}

export function lienTel(numero: string | null | undefined): string | null {
  const n = (numero || '').replace(/[^\d+]/g, '');
  return /^\+?\d{6,15}$/.test(n) ? `tel:${n}` : null;
}

/** Adresse affichée d'un lien : sans « https:// » ni « www. », raccourcie. */
export function adresseCourte(url: string, max = 48): string {
  const s = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}
