// Petits outils d'affichage (français) pour LOYNA Business et les pages publiques.
import qrcode from 'qrcode-generator';

const nf = new Intl.NumberFormat('fr-FR');
// Séparateur des milliers : espace insécable normale (l'espace fine d'Intl est presque invisible avec la police
// du site), comme nombre() de src/data/site.ts : « 24 000 ».
const nbsp = (s: string) => s.replace(/[  ]/g, ' ');
export const num = (n: number | null | undefined) => (n === null || n === undefined ? '–' : nbsp(nf.format(n)));
export const euros = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : nbsp(new Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'}).format(n));

export function date(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', ...(withYear ? {year: 'numeric'} : {})});
}
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'});
}
/** « 12 décembre 2026 », « 1er mars 2027 » (heure de Paris) : dates de l'essai, de l'arrêt et de la conservation. */
export function dayLong(iso: string | null | undefined): string {
  if (!iso) return '–';
  // jour et mois jamais séparés en fin de ligne
  return new Date(iso).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris'}).replace(/^1 /, '1er ').replace(/^(\S+) /, '$1 ');
}
/** « 27/10/2027 » (heure de Paris). */
export function dayNum(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('fr-FR', {day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris'});
}
/** « 27 sept., 16:57 » (l'année seulement si ce n'est pas l'année en cours). */
export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', ...(sameYear ? {} : {year: '2-digit'})})}, ${d.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'})}`;
}
/** « à l'instant », « il y a 3 h », « il y a 12 j »… */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'jamais';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 60) return `il y a ${Math.floor(s / 86400)} j`;
  return date(iso);
}
export const plural = (n: number, one: string, many: string) => `${num(n)} ${Math.abs(n) > 1 ? many : one}`;

export function initials(name: string): string {
  const words = (name || '?')
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w) && !/^(de|du|des|la|le|les|et|chez|au|aux)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?').slice(0, 2);
}

export function uuid(): string {
  return typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Contraste WCAG entre deux couleurs #rrggbb. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '');
    const ch = [0, 2, 4]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((s) => (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** QR code en SVG (chaîne), pour l'afficher ou le télécharger. */
export function qrSvg(text: string, color = '#121216', margin = 2): string {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const s = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
}

export function download(name: string, content: string | Blob, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** « +33639981234 » → « 06 39 98 12 34 » (numéros français), sinon tel quel. */
export const phoneFr = (p: string) => (/^\+33\d{9}$/.test(p) ? `0${p.slice(3)}`.replace(/(\d{2})(?=\d)/g, '$1 ') : p);

/**
 * Fichier CSV lisible par Excel en français : UTF-8 avec BOM, point-virgule, fins de ligne CRLF. Le tableur prendrait pour
 * une formule un texte qui commence par = + - ou @ (les prénoms viennent de la page publique d'inscription) : une
 * apostrophe le neutralise.
 */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Adresse publique de l'inscription des clients d'un commerce. */
export const joinUrl = (slug: string) => `https://loyna.fr/join/${slug}`;

/** « lundi 2 novembre » : remise à zéro du compteur de campagnes de la semaine (heure de Paris). */
export function mondayLabel(iso: string | null | undefined): string {
  if (!iso) return 'lundi prochain';
  const s = new Date(iso).toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris'});
  return s.replace(/ 1 /, ' 1er ');
}

/** « 1er novembre » : premier jour du mois suivant (heure de Paris). */
export function resetDay(iso: string | null | undefined): string {
  if (!iso) return 'le 1er du mois';
  const s = new Date(iso).toLocaleDateString('fr-FR', {day: 'numeric', month: 'long', timeZone: 'Europe/Paris'});
  return s.replace(/^1 /, '1er ');
}

/** Valeur d'un champ datetime-local à l'heure du navigateur (« 2026-10-29T10:00 »). */
export function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Aperçu d'un message automatique, comme le serveur le compose (renderTemplate des Edge Functions) :
 * {prenom}, {commerce}, {reste}, {unite}, {recompense}, {niveau}.
 */
export function renderTemplate(t: string, v: {prenom?: string; commerce?: string; reste?: number | string; unite?: string; recompense?: string; niveau?: string}): string {
  const clean = (x: unknown) => String(x ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  const out = (t || '')
    .replace(/\{\s*pr[ée]nom\s*\}/gi, clean(v.prenom))
    .replace(/\{\s*commerce\s*\}/gi, clean(v.commerce))
    .replace(/\{\s*reste\s*\}/gi, clean(v.reste))
    .replace(/\{\s*unit[ée]\s*\}/gi, clean(v.unite))
    .replace(/\{\s*r[ée]compense\s*\}/gi, clean(v.recompense))
    .replace(/\{\s*niveau\s*\}/gi, clean(v.niveau))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,;:.-]+/, '')
    .trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Typographie française du texte affiché : module à part, sans dépendance (utilisé aussi par le panier).
export {frenchTypography} from './typo';
