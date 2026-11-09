// État partagé de LOYNA Business : session, commerce choisi, offre, navigation, messages.
import {effect, signal} from '@preact/signals';
import {ApiError, readOnlyBackend, supabaseBackend, type Backend} from './backend';
import {isNativeApp} from './native';

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
 * démonstration publique (en développement seulement, avec ?demo&operateur). Jamais dans l'application mobile : l'écran
 * Opérateur reste sur le site.
 */
export function isOperator(): boolean {
  return staffCtx.value?.is_platform_admin === true && (!api.demo || import.meta.env.DEV) && !isNativeApp();
}
export function feature(name: string): boolean {
  return merchant.value?.features?.[name]?.enabled === true;
}
export function featureLimit(name: string): number | null {
  return merchant.value?.features?.[name]?.limit ?? null;
}

// --- Offres incluant chaque fonction (table plan_entitlements, lisible par tout membre) ---------------
// Grille du 2026-10-31 (dépôt LOYNA, docs/OFFRES.md) : Starter et Pro, toujours présentées dans cet ordre. PREMIUM reste en
// base pour Barber Kong, à ses conditions, avec les droits de Pro : son libellé existe, mais il n'est dans aucune liste
// d'offres et aucune pastille ne le cite (loadPlans l'écarte : jamais « Inclus dans Premium »).
export type PlanCode = 'STARTER' | 'PREMIUM' | 'PRO';
export const PLAN_ORDER: PlanCode[] = ['STARTER', 'PRO'];
export const PLAN_LABEL: Record<PlanCode, string> = {STARTER: 'Starter', PREMIUM: 'Premium', PRO: 'Pro'};
export const planLabel = (code: string | null | undefined) => PLAN_LABEL[code as PlanCode] ?? code ?? '';
export const planMap = signal<Record<string, string[]>>({});
// Limites par offre (campagnes par semaine, boutiques) : null = illimité
const planLimits = signal<Record<string, Record<string, number | null>>>({});
export async function loadPlans() {
  try {
    const rows = await api.select<{plan: string; feature: string; enabled: boolean; limit_value?: number | null}>('plan_entitlements', {eq: {enabled: true}});
    const map: Record<string, string[]> = {};
    const limits: Record<string, Record<string, number | null>> = {};
    for (const r of rows) {
      if (!PLAN_ORDER.includes(r.plan as PlanCode)) continue;
      (map[r.feature] ??= []).push(r.plan);
      (limits[r.feature] ??= {})[r.plan] = r.limit_value ?? null;
    }
    const rank = (p: string) => PLAN_ORDER.indexOf(p as PlanCode);
    for (const k of Object.keys(map)) map[k].sort((a, b) => rank(a) - rank(b));
    planMap.value = map;
    planLimits.value = limits;
  } catch {
    /* mention facultative */
  }
}
/** Offre la plus simple qui inclut une fonction (« Starter », « Pro »), vide si inconnue. */
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
/** Plus grande limite chiffrée d'une fonction, parmi les offres vendues (null si inconnue). */
export function maxAnyPlan(featureName: string): number | null {
  const v = Object.values(planLimits.value[featureName] ?? {}).filter((x): x is number => typeof x === 'number');
  return v.length ? Math.max(...v) : null;
}
/** Pastille d'une fonction verrouillée : « Inclus dans Pro ». */
export function lockLabel(featureName: string): string {
  const p = lowestPlan(featureName);
  return p ? `Inclus dans ${p}` : 'Non inclus dans votre offre';
}
/** « Inclus dans l’offre Pro. » / « Inclus dans toutes les offres. » */
export function includedIn(featureName: string): string {
  const plans = (planMap.value[featureName] ?? []).map(planLabel);
  if (!plans.length) return 'Non inclus dans votre offre.';
  return plans.length >= PLAN_ORDER.length ? 'Inclus dans toutes les offres.' : `Inclus dans l’offre ${plans[0]}.`;
}

// --- Consommation de l'offre (RPC my_plan_usage, droit analytics.read) -------------------------------
// Limite null = illimité. Carte = client inscrit (hors supprimés) : illimitées dans toutes les offres. Campagne = un envoi de
// notification aux clients, quel que soit le nombre de destinataires : Starter 5 par semaine, Pro illimitées ; le compteur
// repart chaque lundi (décision d'Ewan du 2026-10-30, chiffres de la grille du 2026-10-31). Les messages automatiques et la
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
  cards: {used: number; limit: number | null};
  /** Absent tant que la migration du 2026-10-30 n'est pas appliquée : l'écran se passe alors du compteur. */
  campaigns?: CampaignQuota;
  locations: {used: number; limit: number | null};
}
export const loadUsage = () => api.rpc<PlanUsage>('my_plan_usage', {p_merchant_id: merchant.value?.merchant_id});

// --- État du service (RPC my_service_state, dépôt LOYNA) ----------------------------------------------
// Une seule décision, côté serveur (private.merchant_service_decision) : essai, abonnement, sursis de 15 jours après un
// paiement échoué, arrêt automatique avec reprise automatique, suspension à la main, compte offert. Ici, seulement l'affichage
// (bandeau, Abonnement, scanner, panneau de démarrage).
export type ServiceCode = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'STOPPED' | 'SUSPENDED_MANUAL' | 'EXEMPT';
export type StopReason = 'TRIAL_ENDED' | 'PAYMENT_FAILED' | 'SUBSCRIPTION_ENDED' | 'OPERATOR';
export interface ServiceState {
  state: ServiceCode;
  plan: PlanCode;
  trial_ends_at: string | null;
  trial_days_left: number | null;
  stop_reason: StopReason | null;
  stopped_at: string | null;
  /** Sursis : date à laquelle la carte sera mise en pause si la facture n'est pas réglée. */
  stop_at: string | null;
  /** Page de paiement de la facture impayée (Stripe), sinon le portail. */
  pay_url: string | null;
  data_delete_after: string | null;
  engaged: boolean;
  commitment_end: string | null;
  /** Abonnement que l'espace client peut changer (fonction subscription-change). */
  can_change: boolean;
}
export const service = signal<ServiceState | null | undefined>(undefined); // undefined : pas encore lu ; null : illisible
let serviceReadAt = 0;
export async function loadService(): Promise<ServiceState | null> {
  const id = merchant.value?.merchant_id;
  if (!id) return null;
  serviceReadAt = Date.now();
  let s: ServiceState | null = null;
  try {
    const r = await api.rpc<ServiceState>('my_service_state', {p_merchant_id: id});
    s = r?.state ? r : null;
  } catch {
    /* état illisible : le bandeau retombe sur le statut du commerce (servicePaused) */
  }
  if (merchant.value?.merchant_id !== id) return s;
  service.value = s;
  // L'offre a changé pendant que l'espace restait ouvert (souscription dans un autre onglet) : droits et menu à relire
  if (s?.plan && s.plan !== merchant.value.subscription_plan && !readOnly()) refreshMerchant().catch(() => {});
  return s;
}
/** Retour sur l'onglet (facture réglée à côté, téléphone de caisse rallumé) : état relu, une fois par minute au plus. */
export function reloadServiceIfStale() {
  if (Date.now() - serviceReadAt > 60000) loadService();
}
/** Carte en pause : plus de scan, d'inscription, de campagne ni de message. Espace, réglages et export restent ouverts. */
export function servicePaused(): boolean {
  const s = service.value;
  return s ? s.state === 'STOPPED' || s.state === 'SUSPENDED_MANUAL' : merchant.value?.merchant_status === 'SUSPENDED';
}
/** Engagement en cours ; une fois la date passée, « comme sans engagement » (cahier des charges, section 2.4). */
export function engagedNow(s: Pick<ServiceState, 'engaged' | 'commitment_end'> | null | undefined): boolean {
  return !!s?.engaged && (!s.commitment_end || new Date(s.commitment_end).getTime() > Date.now());
}
export const PORTAL = 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00';
/** Portail Stripe, adresse préremplie : le compte y reçoit un lien de connexion par e-mail. */
export const portalUrl = (email?: string | null) => (email ? `${PORTAL}?prefilled_email=${encodeURIComponent(email)}` : PORTAL);
/** Panier d'un commerce déjà créé : session reconnue, pas d'étape compte, l'abonnement est rattaché à ce commerce. */
export const choisirUrl = (merchantId: string, plan = 'starter', engage = false) => `/panier/?offre=${plan}&engagement=${engage ? 1 : 0}&commerce=${merchantId}`;

/** Commerce ouvert relu sur le serveur (offre, droits, statut) ; `expected` : attend que Stripe ait appliqué cette offre. */
export async function refreshMerchant(expected?: PlanCode) {
  for (let i = 0; i < 6; i++) {
    const c = await api.rpc<StaffContext>('my_staff_context');
    staffCtx.value = c;
    const m = c.memberships.find((x) => x.merchant_id === merchant.value?.merchant_id);
    if (m) merchant.value = m;
    if (!expected || m?.subscription_plan === expected) return;
    await new Promise((res) => setTimeout(res, 1500));
  }
}

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
