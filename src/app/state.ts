// État partagé de LOYNA Business : session, commerce choisi, navigation, messages.
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
  subscription_plan: 'ESSENTIEL' | 'GROWTH' | 'PRO';
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
export function feature(name: string): boolean {
  return merchant.value?.features?.[name]?.enabled === true;
}
export function featureLimit(name: string): number | null {
  return merchant.value?.features?.[name]?.limit ?? null;
}

// --- Formules incluant chaque fonction (table plan_entitlements, lisible par tout membre) -------------
const PLAN_NAMES: Record<string, string> = {ESSENTIEL: 'Essentiel', GROWTH: 'Growth', PRO: 'Pro'};
export const planMap = signal<Record<string, string[]>>({});
export async function loadPlans() {
  try {
    const rows = await api.select<{plan: string; feature: string; enabled: boolean}>('plan_entitlements', {eq: {enabled: true}});
    const map: Record<string, string[]> = {};
    for (const r of rows) (map[r.feature] ??= []).push(r.plan);
    for (const k of Object.keys(map)) map[k].sort((a, b) => Object.keys(PLAN_NAMES).indexOf(a) - Object.keys(PLAN_NAMES).indexOf(b));
    planMap.value = map;
  } catch {
    /* mention facultative */
  }
}
/** « Inclus dans la formule Pro. » / « Inclus dans les formules Growth et Pro. » (vide si inconnu). */
export function includedIn(featureName: string): string {
  const plans = (planMap.value[featureName] ?? []).map((p) => PLAN_NAMES[p] ?? p);
  if (!plans.length) return 'Non inclus dans votre formule.';
  return plans.length === 1 ? `Inclus dans la formule ${plans[0]}.` : `Inclus dans les formules ${plans.slice(0, -1).join(', ')} et ${plans[plans.length - 1]}.`;
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
