// LOYNA Business : accès aux données. Le navigateur parle directement à Supabase avec la clé
// publishable (jamais de clé secrète) : la sécurité réelle est la RLS et les contrôles des Edge
// Functions. Toute la logique métier (points, récompenses, quotas, permissions) reste côté serveur.
import {createClient, isAuthRetryableFetchError, type SupabaseClient} from '@supabase/supabase-js';
import {ApiError, FUNCTIONS_URL, SUPABASE_KEY, SUPABASE_URL, send} from './http';

export {ApiError, SUPABASE_URL};

export type Match = Record<string, string | number | boolean | null>;
export interface SelectOptions {
  eq?: Match;
  neq?: Match;
  order?: [string, boolean?]; // [colonne, croissant]
  limit?: number;
}

/** Adresse proposée par la Base adresse nationale (géocodage de la boutique). */
export interface GeoResult {
  label: string;
  address: string;
  postal_code: string;
  city: string;
  latitude: number;
  longitude: number;
  score: number;
}

export interface Backend {
  demo: boolean;
  /** Base adresse nationale (géocodage de la Géoplateforme de l'IGN, data.geopf.fr : gratuit et sans clé), appelée depuis le navigateur. */
  geocode(query: string): Promise<GeoResult[]>;
  getSession(): Promise<{email: string} | null>;
  onAuthChange(cb: (event: string, signedIn: boolean) => void): void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  updatePassword(password: string): Promise<void>;
  rpc<T = any>(fn: string, args?: Record<string, unknown>): Promise<T>;
  edge<T = any>(fn: string, body: Record<string, unknown>): Promise<T>;
  select<T = any>(table: string, opts?: SelectOptions): Promise<T[]>;
  insert<T = any>(table: string, row: Record<string, unknown>): Promise<T>;
  update<T = any>(table: string, match: Match, changes: Record<string, unknown>): Promise<T>;
  remove(table: string, match: Match): Promise<void>;
  uploadPublic(bucket: string, path: string, file: Blob): Promise<string>;
}

// Messages des erreurs techniques les plus courantes (Postgres, PostgREST, Auth)
const PG_MESSAGES: Record<string, string> = {
  '23505': 'Cet élément existe déjà (doublon).',
  '23514': 'Une valeur saisie n’est pas acceptée : vérifiez le formulaire.',
  '22P02': 'Une valeur saisie n’a pas le bon format.',
  '42501': 'Vous n’avez pas l’autorisation de faire cette action.',
  PGRST301: 'Votre session a expiré : reconnectez-vous.',
};
const SQL_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Votre session a expiré : reconnectez-vous.',
  FORBIDDEN: 'Vous n’avez pas l’autorisation de faire cette action.',
  MERCHANT_REQUIRED: 'Choisissez d’abord un commerce.',
  LAST_OWNER: 'Le commerce doit garder au moins un propriétaire actif.',
  REWARD_THRESHOLD_ABOVE_CYCLE: 'En mode carte à tampons, le seuil d’une récompense ne peut pas dépasser la longueur de la carte.',
  INVALID_PERMISSIONS: 'Permission inconnue : rechargez la page.',
  FEATURE_NOT_AVAILABLE: 'Cette fonction n’est pas incluse dans votre offre.',
  LOCATIONS_LIMIT: 'Votre offre ne permet pas d’ajouter une autre boutique.',
  TIER_PERKS_INVALID: 'Avantages des niveaux VIP non valides (80 caractères au plus).',
};
// Erreurs dont le serveur donne l'explication en français dans `hint`
const HINTED = new Set(['LOCATIONS_LIMIT', 'TIER_PERKS_INVALID']);

function pgError(e: {code?: string; message?: string; details?: string | null; hint?: string | null}): ApiError {
  const msg = e.message ?? '';
  const known = (HINTED.has(msg) && e.hint) || SQL_MESSAGES[msg] || PG_MESSAGES[e.code ?? ''];
  return new ApiError(msg && SQL_MESSAGES[msg] ? msg : e.code ?? 'ERROR', known || 'L’opération n’a pas abouti. Réessayez dans un instant.', 0, e);
}

/** Recherche d'adresse dans la Base adresse nationale : 5 propositions au plus, la plus probable d'abord. */
async function banSearch(query: string): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  let res: Response;
  try {
    res = await fetch(`https://data.geopf.fr/geocodage/search/?q=${encodeURIComponent(q)}&limit=5`);
  } catch {
    throw new ApiError('NETWORK', 'Recherche d’adresse impossible : vérifiez votre accès à Internet, ou saisissez la position à la main.');
  }
  if (!res.ok) throw new ApiError('GEOCODE', 'La recherche d’adresse ne répond pas : réessayez, ou saisissez la position à la main.', res.status);
  const data: any = await res.json().catch(() => null);
  return (data?.features ?? [])
    .filter((f: any) => Array.isArray(f?.geometry?.coordinates) && f.geometry.coordinates.length >= 2)
    .map((f: any) => ({
      label: String(f.properties?.label ?? ''),
      address: String(f.properties?.name ?? f.properties?.label ?? ''),
      postal_code: String(f.properties?.postcode ?? ''),
      city: String(f.properties?.city ?? ''),
      longitude: Number(f.geometry.coordinates[0]),
      latitude: Number(f.geometry.coordinates[1]),
      score: Number(f.properties?.score ?? 0),
    }));
}

function authMessage(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(raw)) return 'Adresse e-mail non confirmée : ouvrez le lien d’activation reçu.';
  if (/rate limit|too many/i.test(raw)) return 'Trop de tentatives : patientez quelques minutes.';
  if (/weak|pwned|at least|characters/i.test(raw)) return 'Mot de passe trop faible : choisissez-en un plus long et moins courant.';
  if (/same.*password|different from the old/i.test(raw)) return 'Choisissez un mot de passe différent de l’ancien.';
  if (/session|jwt|expired/i.test(raw)) return 'Le lien a expiré : demandez-en un nouveau.';
  if (/fetch|network/i.test(raw)) return 'Connexion impossible : vérifiez votre accès à Internet.';
  return 'La connexion n’a pas abouti. Réessayez dans un instant.';
}

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit', storageKey: 'loyna-business-auth'},
  });
  return client;
}

export const supabaseBackend: Backend = {
  demo: false,
  geocode: banSearch,
  // Téléphone qui se réveille sans réseau (téléphone de caisse, Barber Kong, 2026-10-30) : le jeton n'a pas pu être
  // renouvelé (la bibliothèque a réessayé pendant 30 s), mais la session est intacte : on le signale (ApiError), ce
  // n'est pas une déconnexion.
  async getSession() {
    const {data, error} = await sb().auth.getSession();
    if (data.session) {
      navigator.storage?.persist?.().catch(() => {}); // demande au navigateur de ne pas effacer la session de lui-même
      return {email: data.session.user.email ?? ''};
    }
    if (error && isAuthRetryableFetchError(error)) throw new ApiError('NETWORK', 'Connexion impossible : vérifiez votre accès à Internet.', 0);
    return null;
  },
  onAuthChange(cb) {
    sb().auth.onAuthStateChange((event, session) => cb(event, !!session));
  },
  async signIn(email, password) {
    const {error} = await sb().auth.signInWithPassword({email: email.trim().toLowerCase(), password});
    if (error) throw new ApiError('AUTH', authMessage(error.message), error.status ?? 0);
  },
  // Seulement cet appareil : par défaut, Supabase ferme toutes les sessions du compte, téléphone de caisse compris
  async signOut() {
    await sb().auth.signOut({scope: 'local'});
  },
  async updatePassword(password) {
    const {error} = await sb().auth.updateUser({password});
    if (error) throw new ApiError('AUTH', authMessage(error.message), error.status ?? 0);
  },
  async rpc(fn, args = {}) {
    const {data, error} = await sb().rpc(fn, args);
    if (error) throw pgError(error);
    return data;
  },
  async edge(fn, body) {
    const {data} = await sb().auth.getSession();
    if (!data.session) throw new ApiError('UNAUTHORIZED', 'Votre session a expiré : reconnectez-vous.', 401);
    return send(`${FUNCTIONS_URL}/${fn}`, 'POST', {Authorization: `Bearer ${data.session.access_token}`, apikey: SUPABASE_KEY}, body);
  },
  async select(table, opts = {}) {
    let q: any = sb().from(table).select('*');
    for (const [k, v] of Object.entries(opts.eq ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, v] of Object.entries(opts.neq ?? {})) q = q.neq(k, v);
    if (opts.order) q = q.order(opts.order[0], {ascending: opts.order[1] ?? true});
    if (opts.limit) q = q.limit(opts.limit);
    const {data, error} = await q;
    if (error) throw pgError(error);
    return data ?? [];
  },
  async insert(table, row) {
    const {data, error} = await sb().from(table).insert(row).select('*').single();
    if (error) throw pgError(error);
    return data;
  },
  async update(table, match, changes) {
    let q: any = sb().from(table).update(changes);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const {data, error} = await q.select('*').single();
    if (error) throw pgError(error);
    return data;
  },
  async remove(table, match) {
    let q: any = sb().from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const {error} = await q;
    if (error) throw pgError(error);
  },
  async uploadPublic(bucket, path, file) {
    const {error} = await sb().storage.from(bucket).upload(path, file, {upsert: true, contentType: file.type, cacheControl: '3600'});
    if (error) throw new ApiError('UPLOAD', /size|large/i.test(error.message) ? 'Fichier trop lourd (2 Mo maximum).' : 'L’envoi du fichier a échoué. Vérifiez qu’il s’agit d’une image PNG.');
    return sb().storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },
};

// --- Consultation opérateur (lecture seule) ---------------------------------------------------------------
/** RPC de lecture autorisées pendant une consultation (tout le reste est refusé avant l'envoi). */
const READ_RPCS = new Set([
  'dashboard_kpis',
  'analytics_timeseries',
  'monthly_report',
  'my_plan_usage',
  'search_customers',
  'get_customer_detail',
  'my_subscription',
  'op_orders',
  'op_merchants',
]);
const READ_ONLY_MESSAGE = 'Consultation en lecture seule : aucune modification n’est possible dans l’espace de ce commerce.';
const refuse = (): never => {
  throw new ApiError('READ_ONLY', READ_ONLY_MESSAGE);
};

/**
 * Accès aux données pendant qu'un opérateur LOYNA consulte l'espace d'un commerce : lectures seulement. Filet de
 * sécurité côté navigateur (les écrans masquent déjà les actions) ; le serveur refuse de toute façon toute écriture
 * d'un compte qui n'est pas membre du commerce (migration 0039 du dépôt LOYNA).
 */
export function readOnlyBackend(inner: Backend): Backend {
  return {
    demo: inner.demo,
    geocode: (q) => inner.geocode(q),
    getSession: () => inner.getSession(),
    onAuthChange: (cb) => inner.onAuthChange(cb),
    signIn: () => refuse(),
    signOut: () => inner.signOut(),
    updatePassword: () => refuse(),
    rpc: (fn, args) => (READ_RPCS.has(fn) ? inner.rpc(fn, args) : refuse()),
    edge: () => refuse(),
    select: (table, opts) => inner.select(table, opts),
    insert: () => refuse(),
    update: () => refuse(),
    remove: () => refuse(),
    uploadPublic: () => refuse(),
  };
}

/**
 * Lien « Confirmez votre adresse » d'un compte créé dans le panier (e-mail envoyé par la fonction checkout-create
 * du dépôt LOYNA) : vérifie le jeton et ouvre la session du compte. Renvoie l'adresse confirmée.
 */
export async function verifySignupLink(tokenHash: string): Promise<string> {
  return verifyLink(tokenHash, 'signup');
}

/**
 * Lien « Choisir mon mot de passe » (fonctions staff-manage et merchant-bootstrap du dépôt LOYNA, depuis le
 * 2026-10-27) : /espace-client/mot-de-passe/?token_hash=…&type=recovery. Vérifie le jeton et ouvre la session du
 * compte, qui n'a plus qu'à enregistrer son mot de passe. Renvoie l'adresse du compte.
 */
export async function verifyRecoveryLink(tokenHash: string): Promise<string> {
  return verifyLink(tokenHash, 'recovery');
}

async function verifyLink(tokenHash: string, type: 'signup' | 'recovery'): Promise<string> {
  const {data, error} = await sb().auth.verifyOtp({token_hash: tokenHash, type});
  if (error || !data.session) {
    const raw = `${error?.code ?? ''} ${error?.message ?? ''}`;
    if (/expired|invalid|not.?found|already/i.test(raw) || error?.status === 403) throw new ApiError('LINK_INVALID', 'Ce lien n’est plus valide.', error?.status ?? 0);
    throw new ApiError('AUTH', authMessage(error?.message ?? ''), error?.status ?? 0);
  }
  return data.session.user.email ?? '';
}

/** Lit l'erreur éventuelle renvoyée par Supabase Auth dans l'adresse (lien expiré ou déjà utilisé). */
export function linkError(): string | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const code = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error');
  if (!code) return null;
  if (/expired/i.test(code)) return 'Ce lien a expiré.';
  return 'Ce lien n’est plus valide (il a peut-être déjà été utilisé).';
}
