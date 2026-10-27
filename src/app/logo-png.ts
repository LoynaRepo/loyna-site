// Logo choisi dans l'écran Opérateur : PNG, JPG, WEBP ou SVG, converti en PNG dans le navigateur (les cartes Wallet
// et le bucket merchant-assets n'acceptent que le PNG), transparence conservée. Côté le plus long : 1024 px au plus
// (Google Wallet affiche le logo en 660 px), poids : 1 Mo au plus (limite de lecture des images côté serveur).
// Un SVG est d'abord dessiné en 1024 px, puis transformé en PNG : il reste net.

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

function render(img: HTMLImageElement, w: number, h: number, max: number): Promise<{blob: Blob; width: number; height: number}> {
  const s = Math.min(1, max / Math.max(w, h));
  const width = Math.max(1, Math.round(w * s));
  const height = Math.max(1, Math.round(h * s));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Conversion du logo impossible dans ce navigateur.'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok({blob: b, width, height}) : ko(new Error('Conversion du logo impossible.'))), 'image/png'));
}

/** Convertit le fichier choisi en PNG (1024 px et 1 Mo au plus). Erreurs : message en français. */
export async function logoToPng(file: File): Promise<PngLogo> {
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
    for (const max of SIZES) {
      const out = await render(img, w, h, max);
      if (out.blob.size <= MAX_BYTES) return {...out, url: URL.createObjectURL(out.blob)};
    }
    throw new Error('Logo trop détaillé : même réduit, il dépasse 1 Mo. Essayez une version plus simple.');
  } finally {
    URL.revokeObjectURL(src);
  }
}
