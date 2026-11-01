// Logo choisi dans l'écran Opérateur, le configurateur ou l'essai : PNG, JPG, WEBP ou SVG, converti en PNG dans le navigateur
// (les cartes Wallet et le bucket merchant-assets n'acceptent que le PNG), transparence conservée. logoToPng : côté le plus long
// 1024 px au plus (Google Wallet affiche le logo en 660 px), 1 Mo au plus (limite de lecture des images côté serveur).
// logoToFiles : les deux fichiers légers d'un nouveau commerce (bande passante du plan Free : cahier des charges de la grille,
// chantier A, point 8). Un SVG est d'abord dessiné en 1024 px, puis transformé en PNG : il reste net.

import {partConfondue, retirerFondUni} from './logo-fond';

export const LOGO_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_BYTES = 1_000_000;
const MAX_INPUT = 10 * 1024 * 1024;
const SIZES = [1024, 800, 660, 512];
/** En dessous, le logo risque d'être flou sur la carte Google Wallet. */
export const LOGO_MIN_SIDE = 660;

export interface PngLogo {
  blob: Blob;
  /** Adresse locale (blob:) pour l'aperçu ; à libérer avec URL.revokeObjectURL. */
  url: string;
  width: number;
  height: number;
}

type Kind = 'png' | 'jpg' | 'webp' | 'svg';
function kindOf(file: File): Kind | null {
  const byType: Record<string, Kind> = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg'};
  if (byType[file.type.toLowerCase()]) return byType[file.type.toLowerCase()];
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return ({png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', svg: 'svg'} as Record<string, Kind>)[ext] ?? null;
}

/** Dimension SVG utilisable (nombre positif, sans pourcentage). */
const svgLength = (v: string | null) => {
  const n = parseFloat(v ?? '');
  return v && !/%\s*$/.test(v) && Number.isFinite(n) && n > 0 ? n : 0;
};

/** SVG agrandi à 1024 px sur son côté le plus long (taille et viewBox explicites), prêt à être dessiné. */
async function svgSource(file: File): Promise<{src: string; w: number; h: number}> {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('Ce fichier SVG est illisible.');
  const vb = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  let w = svgLength(svg.getAttribute('width'));
  let h = svgLength(svg.getAttribute('height'));
  if (!w || !h) {
    if (hasVb) {
      const r = vb[2] / vb[3];
      if (!w && !h) [w, h] = [vb[2], vb[3]];
      else if (!w) w = h * r;
      else h = w / r;
    } else [w, h] = [w || h || 1024, h || w || 1024];
  }
  if (!hasVb) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const scale = SIZES[0] / Math.max(w, h);
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {type: 'image/svg+xml'});
  return {src: URL.createObjectURL(blob), w, h};
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error('Cette image est illisible.'));
    img.src = src;
  });
}

function render(img: HTMLImageElement, w: number, h: number, max: number, carre = false, garderFond = false): Promise<{blob: Blob; width: number; height: number; fondRetire: boolean}> {
  const s = Math.min(1, max / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * s));
  const dh = Math.max(1, Math.round(h * s));
  const width = carre ? Math.max(dw, dh) : dw;
  const height = carre ? Math.max(dw, dh) : dh;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return Promise.reject(new Error('Conversion du logo impossible dans ce navigateur.'));
  ctx.imageSmoothingQuality = 'high';
  const x = Math.round((width - dw) / 2);
  const y = Math.round((height - dh) / 2);
  ctx.drawImage(img, x, y, dw, dh);
  // Sur le logo seul : les marges transparentes du format carré ne sont pas son bord
  let fondRetire = false;
  if (!garderFond) {
    const pixels = ctx.getImageData(x, y, dw, dh);
    fondRetire = retirerFondUni(pixels.data, dw, dh);
    if (fondRetire) ctx.putImageData(pixels, x, y);
  }
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok({blob: b, width, height, fondRetire}) : ko(new Error('Conversion du logo impossible.'))), 'image/png'));
}

/** Fichier choisi, ouvert et prêt à être dessiné (erreurs : message en français). */
async function opened<T>(file: File, use: (img: HTMLImageElement, w: number, h: number) => Promise<T>): Promise<T> {
  const kind = kindOf(file);
  if (!kind) throw new Error('Format non pris en charge : choisissez un PNG, JPG, WEBP ou SVG.');
  if (file.size > MAX_INPUT) throw new Error('Fichier trop lourd (10 Mo maximum).');
  let src: string;
  let w = 0;
  let h = 0;
  if (kind === 'svg') ({src, w, h} = await svgSource(file));
  else src = URL.createObjectURL(file);
  try {
    const img = await load(src);
    if (kind !== 'svg') [w, h] = [img.naturalWidth, img.naturalHeight];
    if (!w || !h) throw new Error('Cette image est vide.');
    return await use(img, w, h);
  } catch (err) {
    // SVG qui embarque du HTML (foreignObject) : le navigateur interdit d'en lire les pixels, et son message est en anglais.
    if (err instanceof DOMException) throw new Error('Cette image ne peut pas être convertie : enregistrez-la en PNG ou en JPG.');
    throw err;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Convertit le fichier choisi en PNG (1024 px et 1 Mo au plus). Erreurs : message en français. */
export async function logoToPng(file: File): Promise<PngLogo> {
  return opened(file, async (img, w, h) => {
    for (const max of SIZES) {
      const out = await render(img, w, h, max);
      if (out.blob.size <= MAX_BYTES) return {...out, url: URL.createObjectURL(out.blob)};
    }
    throw new Error('Logo trop détaillé : même réduit, il dépasse 1 Mo. Essayez une version plus simple.');
  });
}

/** Les deux fichiers d'un logo, en PNG, transparence conservée (essai depuis le site, écran Opérateur). */
export interface LogoFiles {
  /** Logo de la classe Google Wallet : 660 px et 200 Ko au plus, en base64 sans préfixe (champ `logo_png` de `POST trial`). */
  logo_png: string;
  /** Icône de la carte Apple, lue à chaque génération de carte : 320 px et 60 Ko au plus, en base64 sans préfixe (`icon_png`). */
  icon_png: string;
  /** Les mêmes fichiers, pour un dépôt direct dans le bucket merchant-assets (écran Opérateur). */
  logo_blob: Blob;
  icon_blob: Blob;
  /** Dimensions de `logo_png` (carré). */
  width: number;
  height: number;
  /** Un fond uni a été retiré (voir logo-fond.ts). */
  fond_retire: boolean;
}

// Tailles essayées de la plus grande à la plus petite. La dernière tient toujours dans la limite : 200 x 200 x 4 octets, ou
// 96 x 96 x 4 octets, avant même la compression du PNG.
// Google affiche le logo dans un rond : le fichier est carré, le logo entier centré sur du transparent, sinon un logo large serait coupé.
const LOGO_FILE = {sizes: [660, 512, 400, 320, 256, 200], maxBytes: 200_000, carre: true};
const ICON_FILE = {sizes: [320, 256, 200, 160, 128, 96], maxBytes: 60_000};

async function fit(img: HTMLImageElement, w: number, h: number, {sizes, maxBytes, carre}: {sizes: number[]; maxBytes: number; carre?: boolean}, garderFond: boolean) {
  for (const max of sizes) {
    const out = await render(img, w, h, max, carre, garderFond);
    if (out.blob.size <= maxBytes) return out;
  }
  throw new Error('Logo trop détaillé : essayez une version plus simple.');
}

function base64(blob: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => ko(new Error('Lecture du logo impossible.'));
    r.readAsDataURL(blob);
  });
}

/** Couleur moyenne des parties visibles d'un logo (#rrggbb), null s'il est entièrement transparent : un logo blanc sur une carte blanche ne se voit pas. */
export async function couleurVisible(src: string): Promise<string | null> {
  const img = await load(src);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  const somme = [0, 0, 0];
  let poids = 0;
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) somme[c] += px[i + c] * px[i + 3];
    poids += px[i + 3];
  }
  return poids ? `#${somme.map((v) => Math.round(v / poids).toString(16).padStart(2, '0')).join('')}` : null;
}

/** Part des pixels visibles du logo qui se confondent avec la couleur de la carte (#rrggbb). */
export async function partLogoConfondue(src: string, carte: string): Promise<number> {
  const img = await load(src);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return 0;
  ctx.drawImage(img, 0, 0, 128, 128);
  const fond = [1, 3, 5].map((i) => parseInt(carte.slice(i, i + 2), 16)) as [number, number, number];
  return partConfondue(ctx.getImageData(0, 0, 128, 128).data, fond);
}

/** Convertit le fichier choisi en `{logo_png, icon_png}` (voir LogoFiles), fond uni retiré sauf `garderFond`. Erreurs : message en français. */
export async function logoToFiles(file: File, {garderFond = false}: {garderFond?: boolean} = {}): Promise<LogoFiles> {
  return opened(file, async (img, w, h) => {
    const logo = await fit(img, w, h, LOGO_FILE, garderFond);
    const icon = await fit(img, w, h, ICON_FILE, garderFond);
    return {logo_png: await base64(logo.blob), icon_png: await base64(icon.blob), logo_blob: logo.blob, icon_blob: icon.blob, width: logo.width, height: logo.height, fond_retire: logo.fondRetire};
  });
}
