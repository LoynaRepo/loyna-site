// Notes d'Ewan sur chaque prospect : chargement et enregistrement auprès de notes.php (serveur aveugle : il ne
// reçoit que des blocs chiffrés dans le navigateur, et vérifie le jeton d'écriture dérivé des identifiants).
// Conflits : chaque écriture porte la version lue (modifie_le_precedent) ; si un autre appareil a écrit entre-temps,
// le serveur répond 409 avec sa version : un ajout est refait dessus tout seul, une modification ou une suppression
// d'une note changée ailleurs demande un choix (Conflit).
import {signal} from '@preact/signals';
import {chiffrerBloc, dechiffrerBloc, importerCleNotes, nouvelId, type Note} from './notes-crypto';

export type {Note};
export const ADRESSE_NOTES = '/espace-commercial/notes.php';
export const TEXTE_MAX = 4000; // caractères par note
const BLOC_MAX = 65536; // limite du serveur (base64)

export interface BlocNotes {
  notes: Note[];
  modifie_le: string; // version du serveur ('' : aucun bloc encore)
}
export interface EtatNotes {
  etat: 'inactif' | 'chargement' | 'pret' | 'lecture';
  blocs: Record<string, BlocNotes>;
  illisibles: string[];
  message: string;
}
export const notesEtat = signal<EtatNotes>({etat: 'inactif', blocs: {}, illisibles: [], message: ''});

let cle: CryptoKey | null = null;
let jeton = '';
let secours: Record<string, Note[]> = {};

export type CodeNotes = 'reseau' | 'jeton' | 'limite' | 'inactif' | 'stockage' | 'trop_grand' | 'conflit' | 'serveur' | 'illisible';
export class ErreurNotes extends Error {
  code: CodeNotes;
  constructor(code: CodeNotes) {
    super(MESSAGES[code]);
    this.code = code;
  }
}
const MESSAGES: Record<CodeNotes, string> = {
  reseau: 'Connexion au serveur impossible.',
  jeton: 'Accès refusé par le serveur des notes : verrouillez puis reconnectez-vous (identifiants changés ?).',
  limite: 'Trop d’essais refusés depuis cette connexion : réessayez dans une heure.',
  inactif: 'Notes pas encore activées : il faut publier les données (panel.py publier).',
  stockage: 'Le serveur ne peut pas enregistrer les notes (stockage inaccessible).',
  trop_grand: 'Trop de texte pour ce prospect (64 Ko au plus) : raccourcissez ou supprimez une note.',
  conflit: 'Les notes ont changé sur un autre appareil pendant l’enregistrement.',
  serveur: 'Erreur du serveur des notes.',
  illisible: 'Notes illisibles sur le serveur (clé différente).',
};

function codeHttp(statut: number, erreur?: string): CodeNotes {
  if (statut === 401 || statut === 403) return 'jeton';
  if (statut === 429) return 'limite';
  if (statut === 413) return 'trop_grand';
  if (statut === 409) return 'conflit';
  if (statut === 503) return erreur === 'non_active' ? 'inactif' : 'stockage';
  return 'serveur';
}

/** Opérations sur la liste des notes d'un prospect, rejouables sur la version du serveur. */
export type Operation =
  | {type: 'ajout'; note: Note}
  | {type: 'modification'; id: string; texte: string; avant: string; cree_le: string}
  | {type: 'suppression'; id: string; avant: string};

/** Note changée (ou supprimée) sur un autre appareil : l'utilisateur choisit. */
export class Conflit extends Error {
  operation: Operation;
  serveur: Note | null;
  constructor(operation: Operation, serveur: Note | null) {
    super('conflit');
    this.operation = operation;
    this.serveur = serveur;
  }
}

/** Applique l'opération ; renvoie la même liste si elle est déjà faite (écriture précédente arrivée malgré une erreur). */
export function appliquer(op: Operation, notes: Note[], maintenant: string, force = false): Note[] {
  if (op.type === 'ajout') {
    // nouvel essai d'un ajout dont la première tentative est peut-être arrivée : jamais de doublon
    const deja = notes.find((n) => n.id === op.note.id);
    if (!deja) return [...notes, op.note];
    return deja.texte === op.note.texte ? notes : notes.map((n) => (n.id === op.note.id ? {...n, texte: op.note.texte, modifie_le: maintenant} : n));
  }
  const i = notes.findIndex((n) => n.id === op.id);
  if (op.type === 'modification') {
    if (i < 0) {
      if (!force) throw new Conflit(op, null);
      return [...notes, {id: op.id, cree_le: op.cree_le, modifie_le: maintenant, texte: op.texte}];
    }
    if (notes[i].texte === op.texte) return notes;
    if (notes[i].modifie_le !== op.avant && !force) throw new Conflit(op, notes[i]);
    return notes.map((n, k) => (k === i ? {...n, texte: op.texte, modifie_le: maintenant} : n));
  }
  if (i < 0) return notes; // déjà supprimée ailleurs
  if (notes[i].modifie_le !== op.avant && !force) throw new Conflit(op, notes[i]);
  return notes.filter((n) => n.id !== op.id);
}

function majBloc(prospect: string, bloc: BlocNotes) {
  notesEtat.value = {...notesEtat.value, blocs: {...notesEtat.value.blocs, [prospect]: bloc}};
}

/** À la connexion : clé des notes (reçue dans donnees.enc) et jeton d'écriture (dérivé des identifiants). */
export async function initialiserNotes(cleB64: string | undefined, jetonHex: string, notesPubliees: Record<string, Note[]>) {
  secours = notesPubliees;
  if (!cleB64) {
    cle = null;
    notesEtat.value = {etat: 'inactif', blocs: lectureSeule(), illisibles: [], message: MESSAGES.inactif};
    return;
  }
  cle = await importerCleNotes(cleB64);
  jeton = jetonHex;
  await chargerNotes();
}

function lectureSeule(): Record<string, BlocNotes> {
  return Object.fromEntries(Object.entries(secours).map(([id, notes]) => [id, {notes, modifie_le: ''}]));
}

/** Toutes les notes depuis le serveur ; en cas d'échec, celles de la dernière publication, en lecture seule. */
export async function chargerNotes(): Promise<void> {
  if (!cle) return;
  notesEtat.value = {...notesEtat.value, etat: 'chargement'};
  try {
    let r: Response;
    try {
      r = await fetch(ADRESSE_NOTES, {cache: 'no-store', credentials: 'same-origin', headers: {'X-Panel-Jeton': jeton}});
    } catch {
      throw new ErreurNotes('reseau');
    }
    const corps = await r.json().catch(() => null);
    if (!r.ok || !corps || typeof corps.blocs !== 'object') throw new ErreurNotes(codeHttp(r.status, corps?.erreur));
    const blocs: Record<string, BlocNotes> = {};
    const illisibles: string[] = [];
    for (const [id, b] of Object.entries(corps.blocs as Record<string, {iv: string; donnees: string; modifie_le: string}>)) {
      try {
        blocs[id] = {notes: await dechiffrerBloc(cle, id, b), modifie_le: String(b.modifie_le || '')};
      } catch {
        illisibles.push(id);
      }
    }
    notesEtat.value = {etat: 'pret', blocs, illisibles, message: ''};
  } catch (e) {
    const message = e instanceof ErreurNotes ? e.message : MESSAGES.serveur;
    notesEtat.value = {etat: 'lecture', blocs: lectureSeule(), illisibles: [], message};
  }
}

/** Enregistre une opération ; en cas de conflit, la refait sur la version du serveur (ou lève Conflit). */
export async function enregistrer(prospect: string, op: Operation, force = false): Promise<'enregistre' | 'fusionne'> {
  if (!cle || notesEtat.value.etat === 'inactif') throw new ErreurNotes('inactif');
  let base = notesEtat.value.blocs[prospect] ?? {notes: [], modifie_le: ''};
  let fusion = false;
  for (let essai = 0; essai < 4; essai++) {
    const nouvelles = appliquer(op, base.notes, new Date().toISOString(), force);
    if (nouvelles === base.notes) return fusion ? 'fusionne' : 'enregistre'; // déjà fait (écriture précédente arrivée)
    const bloc = await chiffrerBloc(cle, prospect, nouvelles);
    if (bloc.donnees.length > BLOC_MAX) throw new ErreurNotes('trop_grand');
    let r: Response;
    try {
      r = await fetch(ADRESSE_NOTES, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-Panel-Jeton': jeton},
        body: JSON.stringify({prospect, iv: bloc.iv, donnees: bloc.donnees, modifie_le_precedent: base.modifie_le || null}),
      });
    } catch {
      throw new ErreurNotes('reseau');
    }
    const corps = await r.json().catch(() => null);
    if (r.ok && corps?.ok) {
      majBloc(prospect, {notes: nouvelles, modifie_le: String(corps.modifie_le)});
      if (notesEtat.value.etat !== 'pret') notesEtat.value = {...notesEtat.value, etat: 'pret', message: ''};
      return fusion ? 'fusionne' : 'enregistre';
    }
    if (r.status !== 409) throw new ErreurNotes(codeHttp(r.status, corps?.erreur));
    // un autre appareil a écrit : on repart de sa version (affichée tout de suite)
    const actuel = corps?.actuel;
    try {
      base = actuel ? {notes: await dechiffrerBloc(cle, prospect, actuel), modifie_le: String(actuel.modifie_le || '')} : {notes: [], modifie_le: ''};
    } catch {
      throw new ErreurNotes('illisible');
    }
    majBloc(prospect, base);
    fusion = true;
  }
  throw new ErreurNotes('conflit');
}

// --- Refus : « Supprimer (a refusé) » ------------------------------------------------------------------------
// Une note qui commence par MARQUE_REFUS retire le prospect du panel tout de suite ; à la mise à jour suivante du
// coffre (panel.py), la fiche passe en « refus » et sort du fichier (archivée, plus aucun contact).
export const MARQUE_REFUS = '[REFUS]';
const estNoteRefus = (n: Note) => n.texte.trimStart().toUpperCase().startsWith(MARQUE_REFUS);

/** Prospect noté « refus » (selon les blocs de notes donnés : à utiliser dans un useMemo). */
export function refuse(blocs: Record<string, BlocNotes>, prospect: string): boolean {
  return (blocs[prospect]?.notes ?? []).some(estNoteRefus);
}

/** Note de refus du prospect (en attente d'archivage), s'il y en a une. */
export function refusDe(prospect: string): Note | null {
  return (notesEtat.value.blocs[prospect]?.notes ?? []).find(estNoteRefus) ?? null;
}

export async function noterRefus(prospect: string, raison: string): Promise<void> {
  if (refusDe(prospect)) return;
  const maintenant = new Date().toISOString();
  const texte = `${MARQUE_REFUS} ${raison.trim() || 'A refusé la proposition.'}`.slice(0, TEXTE_MAX);
  await enregistrer(prospect, {type: 'ajout', note: {id: nouvelId(), cree_le: maintenant, modifie_le: maintenant, texte}});
}

/** Annule un refus pas encore appliqué dans le coffre. */
export async function annulerRefus(prospect: string): Promise<void> {
  const n = refusDe(prospect);
  if (n) await enregistrer(prospect, {type: 'suppression', id: n.id, avant: n.modifie_le}, true);
}

export function notesDe(prospect: string): Note[] {
  const notes = notesEtat.value.blocs[prospect]?.notes ?? [];
  return [...notes].sort((a, b) => (b.cree_le || '').localeCompare(a.cree_le || ''));
}

/** Verrouillage : clé, jeton et notes effacés de la mémoire. */
export function oublierNotes() {
  cle = null;
  jeton = '';
  secours = {};
  brouillons.clear();
  notesEtat.value = {etat: 'inactif', blocs: {}, illisibles: [], message: ''};
}

/** Brouillons non enregistrés, par prospect (en mémoire seulement : jamais écrits dans le navigateur). */
export const brouillons = new Map<string, string>();
