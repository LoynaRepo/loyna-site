// Section « Préparer une carte » : enregistrement et liste auprès de cartes.php (même jeton que les notes).
import {signal} from '@preact/signals';
import {ADRESSE_CARTES, type CartePreparee} from '../lib/carte-preparee';
import {PLANS, QR_VERRE, SETUP_FEE, offerActive} from '../data/site';

export interface CarteListee extends Omit<CartePreparee, 'logo'> {
  id: string;
  cree_le: string;
  modifie_le: string;
  a_logo: boolean;
}

export const cartesPreparees = signal<CarteListee[] | null>(null);
/** Fiche d'où vient la demande (bouton de la fiche prospect) : reprise par le formulaire, une seule fois. */
export const preparerPour = signal<{id: string; nom: string; activite: string} | null>(null);

let jeton = '';
export function initialiserCartes(j: string) {
  jeton = j;
}
export function oublierCartes() {
  jeton = '';
  cartesPreparees.value = null;
  preparerPour.value = null;
}

const MESSAGES: Record<string, string> = {
  jeton_absent: 'Accès refusé : verrouillez puis reconnectez-vous.',
  jeton_refuse: 'Accès refusé : verrouillez puis reconnectez-vous (identifiants changés ?).',
  trop_essais: 'Trop d’essais refusés depuis cette connexion : réessayez dans une heure.',
  non_active: 'Il faut d’abord publier les données du panel (panel.py publier).',
  stockage: 'Le serveur ne peut pas enregistrer la carte (stockage inaccessible).',
  trop_grand: 'Logo trop lourd : choisissez une version plus légère.',
  trop_de_cartes: 'Trop de cartes préparées : supprimez-en quelques-unes.',
  inconnue: 'Cette carte n’existe plus : créez un nouveau lien.',
  carte: 'Réglages refusés par le serveur : vérifiez les champs.',
  logo: 'Logo refusé par le serveur : choisissez une autre image.',
};

async function appel<T>(init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_CARTES, {...init, cache: 'no-store', headers: {'X-Panel-Jeton': jeton, Accept: 'application/json', ...(init.body ? {'Content-Type': 'application/json'} : {})}});
  } catch {
    throw new Error('Connexion au serveur impossible.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(MESSAGES[d?.erreur] ?? 'Erreur du serveur.');
  return d as T;
}

export async function chargerCartes(): Promise<void> {
  const d = await appel<{cartes: CarteListee[]}>();
  cartesPreparees.value = d.cartes;
}

export async function enregistrerCarte(id: string | null, carte: CartePreparee): Promise<string> {
  const d = await appel<{id: string}>({method: 'POST', body: JSON.stringify({...(id ? {id} : {}), carte})});
  await chargerCartes().catch(() => {});
  return d.id;
}

export async function supprimerCarte(id: string): Promise<void> {
  await appel({method: 'POST', body: JSON.stringify({supprimer: id})});
  cartesPreparees.value = (cartesPreparees.value ?? []).filter((c) => c.id !== id);
}

/** Montants de la commande, comme le panier (src/app/Panier.tsx) et checkout-create. */
export function montants(c: Pick<CartePreparee, 'offre' | 'periode' | 'qr'>) {
  const plan = PLANS.find((p) => p.id === c.offre)!;
  const mensuel = c.periode === 'mensuel';
  const abonnement = mensuel ? plan.monthly : plan.yearly;
  const service = mensuel && !offerActive() ? SETUP_FEE : 0;
  const qr = c.qr.unit * QR_VERRE.unit + c.qr.pack5 * QR_VERRE.pack5 + c.qr.pack10 * QR_VERRE.pack10;
  return {plan, mensuel, abonnement, service, qr, total: Math.round((abonnement + service + qr) * 100) / 100, nbQr: c.qr.unit + c.qr.pack5 * 5 + c.qr.pack10 * 10};
}

/** Couleurs dominantes d'un logo (PNG en data:), pour les proposer d'un clic : blanc, noir et gris écartés. */
export function couleursDuLogo(src: string): Promise<string[]> {
  return new Promise((ok) => {
    const img = new Image();
    img.onerror = () => ok([]);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) return ok([]);
      ctx.drawImage(img, 0, 0, 64, 64);
      const {data} = ctx.getImageData(0, 0, 64, 64);
      const compte = new Map<string, {n: number; r: number; g: number; b: number}>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (Math.max(r, g, b) - Math.min(r, g, b) < 28) continue; // gris, blanc, noir
        const cle = `${r >> 4}-${g >> 4}-${b >> 4}`;
        const e = compte.get(cle) ?? {n: 0, r: 0, g: 0, b: 0};
        e.n++;
        e.r += r;
        e.g += g;
        e.b += b;
        compte.set(cle, e);
      }
      const hexa = (v: number) => Math.round(v).toString(16).padStart(2, '0');
      // Les plus présentes, en écartant les nuances trop proches d'une couleur déjà retenue
      const gardees: {r: number; g: number; b: number}[] = [];
      for (const e of [...compte.values()].sort((a, b) => b.n - a.n)) {
        const c = {r: e.r / e.n, g: e.g / e.n, b: e.b / e.n};
        if (gardees.length < 4 && gardees.every((x) => Math.hypot(x.r - c.r, x.g - c.g, x.b - c.b) > 70)) gardees.push(c);
      }
      ok(gardees.map((c) => `#${hexa(c.r)}${hexa(c.g)}${hexa(c.b)}`));
    };
    img.src = src;
  });
}
