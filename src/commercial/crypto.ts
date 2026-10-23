// Déchiffrement des données du panel commercial dans le navigateur (WebCrypto), format produit par
// `_systeme/panel.py` du coffre de prospection : AES-256-GCM, clé dérivée par PBKDF2-SHA256 (≥ 600 000
// itérations, sel aléatoire) de « identifiant (sans espaces autour, en minuscules) + NUL + mot de passe »,
// JSON compressé en gzip avant chiffrement. Le mot de passe ne quitte jamais cette page.
// Aucune dépendance : ce module est aussi lu tel quel par Node (tools/commercial/verifier.mjs).

export const ADRESSE_DONNEES = '/espace-commercial/donnees.enc';
const FORMAT = 'loyna-espace-commercial';
const AAD = new TextEncoder().encode('loyna-espace-commercial/v1');
const ITERATIONS_MIN = 600_000;
const CLE_SESSION = 'loyna-commercial-cle';

export interface Enveloppe {
  format: string;
  version: number;
  kdf: string;
  iterations: number;
  sel: string;
  chiffrement: string;
  iv: string;
  compression: string;
  donnees: string;
}

export type CodeErreur = 'identifiants' | 'absent' | 'reseau' | 'format' | 'navigateur';
export class ErreurAcces extends Error {
  code: CodeErreur;
  constructor(code: CodeErreur, message: string) {
    super(message);
    this.code = code;
  }
}

const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const versB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(''));

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s || typeof DecompressionStream === 'undefined')
    throw new ErreurAcces('navigateur', 'Ce navigateur est trop ancien pour ouvrir le panel : mettez-le à jour (Safari, Chrome, Firefox ou Edge récents).');
  return s;
}

export function lireEnveloppe(texte: string): Enveloppe {
  let e: Enveloppe;
  try {
    e = JSON.parse(texte);
  } catch {
    throw new ErreurAcces('format', 'Fichier de données illisible : republier les données (panel.py publier).');
  }
  if (
    e?.format !== FORMAT ||
    e.version !== 1 ||
    e.kdf !== 'PBKDF2-SHA256' ||
    e.chiffrement !== 'AES-256-GCM' ||
    e.compression !== 'gzip' ||
    !(e.iterations >= ITERATIONS_MIN) ||
    !e.sel ||
    !e.iv ||
    !e.donnees
  )
    throw new ErreurAcces('format', 'Format de données inconnu : republier les données (panel.py publier).');
  return e;
}

/** Fichier chiffré en ligne (jamais mis en cache). */
export async function telecharger(adresse = ADRESSE_DONNEES): Promise<Enveloppe> {
  let r: Response;
  try {
    r = await fetch(adresse, {cache: 'no-store', credentials: 'same-origin'});
  } catch {
    throw new ErreurAcces('reseau', 'Connexion impossible : vérifiez le réseau, puis réessayez.');
  }
  if (r.status === 404) throw new ErreurAcces('absent', 'Aucune donnée publiée pour le moment (panel.py publier).');
  if (!r.ok) throw new ErreurAcces('reseau', `Chargement impossible (erreur ${r.status}) : réessayez dans un instant.`);
  return lireEnveloppe(await r.text());
}

function secret(identifiant: string, motDePasse: string) {
  const id = identifiant.normalize('NFC').trim().toLowerCase();
  return new TextEncoder().encode(id + '\u0000' + motDePasse.normalize('NFC'));
}

/** Accès dérivé des identifiants : clé AES des données et jeton d'écriture des notes. */
export interface Acces {
  cle: CryptoKey; // déchiffre donnees.enc
  brut: Uint8Array; // la même clé, pour l'option « Rester connecté »
  jeton: string; // 64 caractères hexadécimaux, envoyé à notes.php (le serveur n'en garde que le SHA-256)
}

/**
 * PBKDF2-SHA256 sur 512 bits (≈ 1 s sur téléphone : c'est voulu, chaque essai coûte cher). Les 256 premiers
 * bits sont exactement la clé AES historique (PBKDF2 calcule ses blocs de 32 octets indépendamment) ; les
 * 256 suivants forment le jeton d'écriture, qui ne permet pas de retrouver la clé, ni l'inverse.
 */
export async function deriverAcces(identifiant: string, motDePasse: string, e: Enveloppe): Promise<Acces> {
  const s = subtle();
  const base = await s.importKey('raw', secret(identifiant, motDePasse), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await s.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: deB64(e.sel), iterations: e.iterations}, base, 512));
  const brut = bits.slice(0, 32);
  const jeton = Array.from(bits.slice(32), (b) => b.toString(16).padStart(2, '0')).join('');
  const cle = await s.importKey('raw', brut, {name: 'AES-GCM'}, false, ['decrypt']);
  return {cle, brut, jeton};
}

/** Déchiffre et décompresse ; identifiants faux → ErreurAcces('identifiants'). */
export async function ouvrir<T = unknown>(e: Enveloppe, cle: CryptoKey): Promise<T> {
  let clair: ArrayBuffer;
  try {
    clair = await subtle().decrypt({name: 'AES-GCM', iv: deB64(e.iv), additionalData: AAD, tagLength: 128}, cle, deB64(e.donnees));
  } catch (err) {
    if (err instanceof ErreurAcces) throw err;
    throw new ErreurAcces('identifiants', 'Identifiant ou mot de passe incorrect.');
  }
  try {
    const flux = new Blob([clair]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(flux).text()) as T;
  } catch {
    throw new ErreurAcces('format', 'Données illisibles : republier les données (panel.py publier).');
  }
}

// Option « Rester connecté dans cet onglet » : la clé AES et le jeton d'écriture (jamais le mot de passe) sont
// gardés dans le sessionStorage de l'onglet, effacés quand l'onglet se ferme ou au verrouillage. Le sel ne change
// qu'avec les identifiants (script 3) : l'accès reste valable d'une publication des données à l'autre.
export function memoriserAcces(acces: Acces, e: Enveloppe): void {
  try {
    sessionStorage.setItem(CLE_SESSION, JSON.stringify({sel: e.sel, cle: versB64(acces.brut), jeton: acces.jeton}));
  } catch {
    /* stockage indisponible (navigation privée) : il faudra se reconnecter */
  }
}

export async function accesMemorise(e: Enveloppe): Promise<Acces | null> {
  try {
    const s = JSON.parse(sessionStorage.getItem(CLE_SESSION) || 'null');
    if (!s || s.sel !== e.sel || !s.cle || !/^[0-9a-f]{64}$/.test(s.jeton || '')) return null;
    const brut = deB64(s.cle);
    return {cle: await subtle().importKey('raw', brut, {name: 'AES-GCM'}, false, ['decrypt']), brut, jeton: s.jeton};
  } catch {
    return null;
  }
}

export function sessionOuverte(): boolean {
  try {
    return !!sessionStorage.getItem(CLE_SESSION);
  } catch {
    return false;
  }
}

export function oublierCle(): void {
  try {
    sessionStorage.removeItem(CLE_SESSION);
  } catch {
    /* rien à effacer */
  }
}
