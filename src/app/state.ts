// État partagé de LOYNA Business : session, commerce choisi, offre, navigation, messages.
import {signal} from '@preact/signals';
import {supabaseBackend, type Backend} from './backend';

export interface Membership {
  staff_id: string;
  merchant_id: string;
  merchant_name: string;
  merchant_slug: string;
  merchant_status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  subscription_plan: PlanCode;
  role: 'OWNER' | 'ADMIN' | 'STAFF';
  display_name: string;
  permissions: string[];
  features: Record<string, {enabled: boolean; limit: number | null}>;
}
export interface StaffContext {
  user_id: string;
  is_platform_admin: boolean;
  memberships: Membership[];
}

/** Accès aux données : Supabase en production, données fictives en démonstration locale. */
export let api: Backend = supabaseBackend;
export function setBackend(b: Backend) {
  api = b;
}

export const session = signal<{email: string} | null | undefined>(undefined); // undefined : vérification en cours
export const staffCtx = signal<StaffContext | null>(null);
export const merchant = signal<Membership | null>(null);
export const route = signal(parseRoute());

export function can(permission: string): boolean {
  return !!merchant.value?.permissions.includes(permission);
}
/**
 * Opérateur LOYNA (table platform_admins), d'après le serveur (my_staff_context) : affiche l'onglet « Opérateur ».
 * Simple affichage : chaque appel de cet écran est refusé par le serveur à un autre compte. Jamais dans la
 * démonstration publique (en développement seulement, avec ?demo&operateur).
 */
export function isOperator(): boolean {
  return staffCtx.value?.is_platform_admin === true && (!api.demo || import.meta.env.DEV);
}
export function feature(name: string): boolean {
  return merchant.value?.features?.[name]?.enabled === true;
}
export function featureLimit(name: string): number | null {
  return merchant.value?.features?.[name]?.limit ?? null;
}

// --- Offres incluant chaque fonction (table plan_entitlements, lisible par tout membre) ---------------
// Offres du 2026-10-25 (dépôt LOYNA, docs/OFFRES.md), toujours présentées dans cet ordre.
export type PlanCode = 'STARTER' | 'PREMIUM' | 'PRO';
export const PLAN_ORDER: PlanCode[] = ['STARTER', 'PREMIUM', 'PRO'];
export const PLAN_LABEL: Record<PlanCode, string> = {STARTER: 'Starter', PREMIUM: 'Premium', PRO: 'Pro'};
export const planLabel = (code: string | null | undefined) => PLAN_LABEL[code as PlanCode] ?? code ?? '';
export const planMap = signal<Record<string, string[]>>({});
// Limites par offre (cartes, notifications, boutiques) : null = illimité
const planLimits = signal<Record<string, Record<string, number | null>>>({});
export async function loadPlans() {
  try {
    const rows = await api.select<{plan: string; feature: string; enabled: boolean; limit_value?: number | null}>('plan_entitlements', {eq: {enabled: true}});
    const map: Record<string, string[]> = {};
    const limits: Record<string, Record<string, number | null>> = {};
    for (const r of rows) {
      (map[r.feature] ??= []).push(r.plan);
      (limits[r.feature] ??= {})[r.plan] = r.limit_value ?? null;
    }
    const rank = (p: string) => (PLAN_ORDER.indexOf(p as PlanCode) + 4) % 4; // offre inconnue : en dernier
    for (const k of Object.keys(map)) map[k].sort((a, b) => rank(a) - rank(b));
    planMap.value = map;
    planLimits.value = limits;
  } catch {
    /* mention facultative */
  }
}
/** Offre la plus simple qui inclut une fonction (« Premium », « Pro »), vide si inconnue. */
export function lowestPlan(featureName: string): string {
  const first = (planMap.value[featureName] ?? [])[0];
  return first ? planLabel(first) : '';
}
/** Offre la plus simple dont la limite dépasse `min` (ex. : plus d'une boutique → « Pro »), vide si inconnue. */
export function lowestPlanAbove(featureName: string, min: number): string {
  const lim = planLimits.value[featureName] ?? {};
  const p = (planMap.value[featureName] ?? []).find((x) => lim[x] === null || (lim[x] ?? 0) > min);
  return p ? planLabel(p) : '';
}
/** Plus grande limite chiffrée d'une fonction, toutes offres confondues (null si inconnue). */
export function maxAnyPlan(featureName: string): number | null {
  const v = Object.values(planLimits.value[featureName] ?? {}).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.max(...v) : null;
}
/** Pastille d'une fonction verrouillée : « Inclus dans Premium », « Inclus dans Pro ». */
export function lockLabel(featureName: string): string {
  const p = lowestPlan(featureName);
  return p ? `Inclus dans ${p}` : 'Non inclus dans votre offre';
}
/** « Inclus dans l’offre Pro. » / « Inclus dans les offres Premium et Pro. » */
export function includedIn(featureName: string): string {
  const plans = (planMap.value[featureName] ?? []).map(planLabel);
  if (!plans.length) return 'Non inclus dans votre offre.';
  return plans.length === 1 ? `Inclus dans l’offre ${plans[0]}.` : `Inclus dans les offres ${plans.slice(0, -1).join(', ')} et ${plans[plans.length - 1]}.`;
}

// --- Consommation de l'offre (RPC my_plan_usage, droit analytics.read) -------------------------------
// Limite null = illimité. Carte = client inscrit (hors supprimés) ; notification = message de campagne
// reçu par une carte, quota rechargé le 1er du mois (messages automatiques et proximité jamais décomptés).
export interface PlanUsage {
  plan: PlanCode;
  cards: {used: number; limit: number | null};
  notifications: {limit: number | null; used: number; remaining: number | null; resets_at: string};
  locations: {used: number; limit: number | null};
}
export const loadUsage = () => api.rpc<PlanUsage>('my_plan_usage', {p_merchant_id: merchant.value?.merchant_id});

// --- Navigation par ancre (#/clients/…) : fonctionne sur un hébergement statique ---------------
export function parseRoute(): {view: string; id?: string} {
  const parts = (typeof location === 'undefined' ? '' : location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);
  return {view: parts[0] ?? '', id: parts[1]};
}
export function go(path: string) {
  const target = `#/${path.replace(/^[#/]+/, '')}`;
  if (location.hash === target) route.value = parseRoute();
  else location.hash = target;
}
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    route.value = parseRoute();
    window.scrollTo({top: 0});
  });
}

// --- Messages éphémères ---------------------------------------------------------------------------
export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error' | 'info';
}
export const toasts = signal<Toast[]>([]);
let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const t = {id: ++toastId, text, tone};
  toasts.value = [...toasts.value, t];
  setTimeout(() => (toasts.value = toasts.value.filter((x) => x.id !== t.id)), tone === 'error' ? 6500 : 3800);
}
export function toastError(e: unknown) {
  toast(e instanceof Error ? e.message : 'L’opération n’a pas abouti.', 'error');
}

// --- Commerce mémorisé ----------------------------------------------------------------------------
const MERCHANT_KEY = 'loyna-business-merchant';
export function rememberMerchant(id: string) {
  try {
    localStorage.setItem(MERCHANT_KEY, id);
  } catch {
    /* stockage indisponible */
  }
}
export function rememberedMerchant(): string | null {
  try {
    return localStorage.getItem(MERCHANT_KEY);
  } catch {
    return null;
  }
}
