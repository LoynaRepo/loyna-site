// LOYNA Business : accès aux données. Le navigateur parle directement à Supabase avec la clé
// publishable (jamais de clé secrète) : la sécurité réelle est la RLS et les contrôles des Edge
// Functions. Toute la logique métier (points, récompenses, quotas, permissions) reste côté serveur.
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {ApiError, FUNCTIONS_URL, SUPABASE_KEY, SUPABASE_URL, send} from './http';

export {ApiError, SUPABASE_URL};

export type Match = Record<string, string | number | boolean | null>;
export interface SelectOptions {
  eq?: Match;
  neq?: Match;
  order?: [string, boolean?]; // [colonne, croissant]
  limit?: number;
}

export interface Backend {
  demo: boolean;
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
};

function pgError(e: {code?: string; message?: string; details?: string | null; hint?: string | null}): ApiError {
  const msg = e.message ?? '';
  const known = SQL_MESSAGES[msg] ?? PG_MESSAGES[e.code ?? ''];
  return new ApiError(msg && SQL_MESSAGES[msg] ? msg : e.code ?? 'ERROR', known ?? 'L’opération n’a pas abouti. Réessayez dans un instant.', 0, e);
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
  async getSession() {
    const {data} = await sb().auth.getSession();
    return data.session ? {email: data.session.user.email ?? ''} : null;
  },
  onAuthChange(cb) {
    sb().auth.onAuthStateChange((event, session) => cb(event, !!session));
  },
  async signIn(email, password) {
    const {error} = await sb().auth.signInWithPassword({email: email.trim().toLowerCase(), password});
    if (error) throw new ApiError('AUTH', authMessage(error.message), error.status ?? 0);
  },
  async signOut() {
    await sb().auth.signOut();
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

/** Lit l'erreur éventuelle renvoyée par Supabase Auth dans l'adresse (lien expiré ou déjà utilisé). */
export function linkError(): string | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const code = h.get('error_code') || q.get('error_code') || h.get('error') || q.get('error');
  if (!code) return null;
  if (/expired/i.test(code)) return 'Ce lien a expiré.';
  return 'Ce lien n’est plus valide (il a peut-être déjà été utilisé).';
}
