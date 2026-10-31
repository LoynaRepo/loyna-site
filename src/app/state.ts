// État partagé de LOYNA Business : session, commerce choisi, offre, navigation, messages.
import {effect, signal} from '@preact/signals';
import {ApiError, readOnlyBackend, supabaseBackend, type Backend} from './backend';

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
  /** Espace ouvert par un opérateur LOYNA depuis l'écran Opérateur : consultation en lecture seule. */
  consultation?: boolean;
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
/** Consultation de l'espace d'un commerce par un opérateur LOYNA : tout est visible, rien n'est modifiable. */
export function readOnly(): boolean {
  return merchant.value?.consultation === true;
}
/**
 * Page visible : avec le droit de gestion qui l'ouvre d'habitude, ou en consultation opérateur (lecture seule :
 * l'opérateur n'a que des droits de lecture, les actions de la page restent masquées).
 */
export function canSee(permission: string): boolean {
  return can(permission) || readOnly();
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
// Limite null = illimité. Carte = client inscrit (hors supprimés) ; limite = celle de l'offre + 500 par pack
// « +500 cartes » utilisable (option du 2026-10-30). Campagne = un envoi de notification aux clients, quel que soit le
// nombre de destinataires : Starter 2 par semaine, Premium 5, Pro illimitées ; le compteur repart chaque lundi
// (décision d'Ewan du 2026-10-30, qui remplace le quota mensuel de notifications). Les messages automatiques et la
// proximité ne sont jamais décomptés.
export interface CampaignQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
  week_start: string;
  /** Lundi 0 h suivant, heure du commerce : remise à zéro du compteur. */
  resets_at: string;
}
export interface PlanUsage {
  plan: PlanCode;
  cards: {used: number; limit: number | null; base_limit?: number | null; packs?: number; pack_size?: number | null};
  /** Absent tant que la migration du 2026-10-30 n'est pas appliquée : l'écran se passe alors du compteur. */
  campaigns?: CampaignQuota;
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

// --- Consultation de l'espace d'un commerce par un opérateur LOYNA (lecture seule) --------------------------
// Écran Opérateur → « Ouvrir son espace » : LOYNA Business du commerce tel que son propriétaire le voit. Le serveur
// (op_merchant_context, migration 0039 du dépôt LOYNA) vérifie que le compte est opérateur et n'ouvre que la
// lecture ; ici, l'opérateur ne reçoit que des droits de lecture et l'accès aux données refuse toute écriture.
export type ConsultedMerchant = Omit<Membership, 'staff_id' | 'role' | 'display_name' | 'permissions' | 'consultation'>;
/** Droits donnés à l'opérateur pendant une consultation : statistiques et clients, jamais d'action. */
const CONSULTATION_PERMISSIONS = ['analytics.read', 'customers.read_basic', 'customers.read'];
let consultation: {base: Backend; before: Membership | null} | null = null;

export async function openConsultation(merchantId: string): Promise<void> {
  const base = consultation?.base ?? api;
  const r = await base.rpc<{status: string; merchant?: ConsultedMerchant}>('op_merchant_context', {p_merchant_id: merchantId});
  if (r?.status !== 'OK' || !r.merchant) throw new ApiError('NOT_FOUND', 'Ce commerce est introuvable : actualisez la liste.');
  // Démonstration locale (?demo&operateur) : données fictives propres au commerce ouvert
  const data = base.demo ? (await import('./mock')).consultationBackend(r.merchant) : base;
  consultation = {base, before: consultation ? consultation.before : merchant.value};
  api = readOnlyBackend(data);
  merchant.value = {...r.merchant, staff_id: '', role: 'STAFF', display_name: 'Opérateur LOYNA', permissions: CONSULTATION_PERMISSIONS, consultation: true};
}

/** « Quitter » : retour à l'écran Opérateur (dans son propre commerce s'il en avait un ouvert). */
export function closeConsultation() {
  route.value = {view: 'operateur'}; // tout de suite (l'ancre change ensuite) : pas de passage par le choix du commerce
  go('operateur');
  merchant.value = consultation?.before ?? null;
}

// Dès que l'espace affiché n'est plus une consultation (Quitter, déconnexion, changement de commerce), l'accès
// normal aux données revient.
effect(() => {
  if (!merchant.value?.consultation && consultation) {
    api = consultation.base;
    consultation = null;
  }
});
