// Chiffrement des notes du panel commercial, dans le navigateur (WebCrypto). Le serveur (notes.php) ne reçoit
// que des blocs chiffrés : un bloc par prospect = la liste de ses notes en JSON, AES-256-GCM, iv aléatoire de
// 12 octets, données associées « loyna-notes/v1/<prospect> » (un bloc ne peut pas être recopié sur un autre
// prospect). La clé des notes est tirée au hasard une fois pour toutes par _systeme/panel.py (Gestionnaire
// d'identifiants) et arrive dans donnees.enc : elle ne change pas quand Ewan change ses identifiants.
// Aucune dépendance : ce module est aussi lu tel quel par Node (tools/commercial/test_notes_crypto.mjs).

export interface Note {
  id: string;
  cree_le: string; // ISO 8601 (UTC)
  modifie_le: string; // ISO 8601 (UTC)
  texte: string;
}

export interface BlocChiffre {
  iv: string; // base64, 12 octets
  donnees: string; // base64, chiffré + étiquette GCM
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const versB64 = (b: Uint8Array) => btoa(Array.from(b, (x) => String.fromCharCode(x)).join(''));
const aad = (prospect: string) => enc.encode(`loyna-notes/v1/${prospect}`);

/** Clé AES des notes (32 octets en base64, reçus dans les données déchiffrées). */
export async function importerCleNotes(b64: string): Promise<CryptoKey> {
  const brut = deB64(b64);
  if (brut.length !== 32) throw new Error('clé des notes invalide');
  return crypto.subtle.importKey('raw', brut, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

export async function chiffrerBloc(cle: CryptoKey, prospect: string, notes: Note[]): Promise<BlocChiffre> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clair = enc.encode(JSON.stringify(notes));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad(prospect), tagLength: 128}, cle, clair));
  return {iv: versB64(iv), donnees: versB64(chiffre)};
}

/** Déchiffre un bloc ; lève une erreur si la clé, le prospect ou les données ne correspondent pas. */
export async function dechiffrerBloc(cle: CryptoKey, prospect: string, bloc: BlocChiffre): Promise<Note[]> {
  const clair = await crypto.subtle.decrypt({name: 'AES-GCM', iv: deB64(bloc.iv), additionalData: aad(prospect), tagLength: 128}, cle, deB64(bloc.donnees));
  const notes = JSON.parse(dec.decode(clair));
  if (!Array.isArray(notes)) throw new Error('bloc de notes illisible');
  return notes
    .filter((n) => n && typeof n.id === 'string' && typeof n.texte === 'string')
    .map((n) => ({id: n.id, cree_le: String(n.cree_le || ''), modifie_le: String(n.modifie_le || n.cree_le || ''), texte: n.texte}));
}

/** Identifiant de note : 16 caractères hexadécimaux aléatoires. */
export function nouvelId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
}
