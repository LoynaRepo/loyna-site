// État du panel commercial : données déchiffrées (en mémoire seulement), navigation par ancre, filtres, messages.
import {signal} from '@preact/signals';
import type {Suivi} from './types';

/** Données déchiffrées : jamais écrites dans le navigateur (ni localStorage, ni cache). */
export const donnees = signal<Suivi | null>(null);

// --- Navigation par ancre (#/prospects, #/prospect/<id>…) : fonctionne sur un hébergement statique -----
export interface Route {
  vue: string;
  id?: string;
}
export function lireRoute(): Route {
  const parts = (typeof location === 'undefined' ? '' : location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);
  return {vue: parts[0] ?? '', id: parts[1] ? decodeURIComponent(parts[1]) : undefined};
}
export const route = signal<Route>(lireRoute());
export function aller(chemin: string) {
  const cible = `#/${chemin.replace(/^[#/]+/, '')}`;
  if (location.hash === cible) route.value = lireRoute();
  else location.hash = cible;
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const avant = route.value.vue;
    route.value = lireRoute();
    // retour d'une fiche vers la liste : on garde la position ; sinon, haut de page
    if (!(avant === 'prospect' && route.value.vue === 'prospects')) window.scrollTo({top: 0});
  });
}

// --- Filtres de la liste « Prospects » (gardés en revenant d'une fiche) ----------------------------
export interface Filtres {
  q: string;
  statut: string;
  cible: string;
  ville: string;
  famille: string;
  action: string;
  recu: string;
  reponse: string;
  tri: string;
}
export const FILTRES_VIDES: Filtres = {q: '', statut: '', cible: '', ville: '', famille: '', action: '', recu: '', reponse: '', tri: 'action'};
export const filtres = signal<Filtres>({...FILTRES_VIDES});
/** Ouvre la liste des prospects avec ces filtres (depuis le tableau de bord). */
export function voirProspects(f: Partial<Filtres>) {
  filtres.value = {...FILTRES_VIDES, ...f};
  aller('prospects');
}

// --- Messages éphémères -------------------------------------------------------------------------------
export interface Toast {
  id: number;
  texte: string;
  ton: 'ok' | 'info' | 'error';
}
export const toasts = signal<Toast[]>([]);
let n = 0;
export function toast(texte: string, ton: Toast['ton'] = 'ok') {
  const t = {id: ++n, texte, ton};
  toasts.value = [...toasts.value, t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), ton === 'error' ? 6000 : 3200);
}
