// Appels HTTP vers Supabase sans le client complet : utilisé tel quel par les pages publiques
// (inscription d'un client, préférences) pour rester très léger sur téléphone.
// PUBLIC_LOYNA_SUPABASE_URL et _KEY : pile d'essai seulement (R/.env.local, jamais recopié dans S) ; sans elles, la production.
export const SUPABASE_URL: string = import.meta.env.PUBLIC_LOYNA_SUPABASE_URL || 'https://alfxnoaxcmnbrqhlmmqq.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.PUBLIC_LOYNA_SUPABASE_KEY || 'sb_publishable_PpdFN5uFX83LlxbM7uNhmA_NA_EGPmB';
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/** Erreur lisible par l'utilisateur (message en français), avec le code renvoyé par l'API. */
export class ApiError extends Error {
  code: string;
  status: number;
  data: any;
  constructor(code: string, message: string, status = 0, data: any = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

/** Appel d'une Edge Function sans session (pages publiques : inscription, préférences). */
export async function publicEdge<T = any>(fn: string, init: {method?: string; query?: Record<string, string>; body?: unknown} = {}): Promise<T> {
  const url = new URL(`${FUNCTIONS_URL}/${fn}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  return send<T>(url.toString(), init.method ?? 'POST', {apikey: SUPABASE_KEY}, init.body);
}

export async function send<T>(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? headers : {...headers, 'content-type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Connexion impossible : vérifiez votre accès à Internet.');
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* réponse vide */
  }
  if (!res.ok) {
    const err = data?.error;
    const message =
      (typeof err === 'object' && err?.message) || data?.message || (res.status === 401 ? 'Votre session a expiré : reconnectez-vous.' : 'L’opération n’a pas abouti. Réessayez dans un instant.');
    throw new ApiError((typeof err === 'object' && err?.code) || data?.status || `HTTP_${res.status}`, message, res.status, data);
  }
  return data as T;
}

