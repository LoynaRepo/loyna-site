// Clients du panel commercial : boutons « Commerce créé », « Documents envoyés », « QR codes livrés ».
// Même mécanisme que le refus d'un prospect : une note chiffrée « [CLIENT:<action>] AAAA-MM-JJ · précision » est
// enregistrée auprès de notes.php ; le parcours change tout de suite dans le panel, et panel.py la recopie dans la
// fiche du coffre (propriété datée et ligne d'historique) à la publication suivante. Tant que ce n'est pas fait,
// l'action peut être annulée (la note est supprimée).
import {enregistrer, notesEtat, type BlocNotes, type Note} from './notes';
import {nouvelId} from './notes-crypto';
import {actionsNotees, clientAJour, estNoteAction, texteAction, trierClients, type ClientAffiche, type CodeAction} from './clients-regles';
import type {Client} from './types';

export {ACTIONS, estNoteAction, type ClientAffiche, type CodeAction} from './clients-regles';

/** Clients affichés (actions en attente comprises), urgences d'abord. À utiliser dans un useMemo. */
export function clientsAffiches(clients: Client[] | undefined, blocs: Record<string, BlocNotes>, auj = new Date()): ClientAffiche[] {
  return trierClients((clients ?? []).map((c) => clientAJour(c, blocs[c.id]?.notes ?? [], auj)));
}

/** Notes libres d'un client (sans les notes d'action). */
export const noteLibre = (n: Note) => !estNoteAction(n);

export async function noterAction(client: string, code: CodeAction, date: string, precision: string): Promise<void> {
  const deja = actionsNotees(notesEtat.value.blocs[client]?.notes ?? [])[code];
  if (deja) return;
  const maintenant = new Date().toISOString();
  await enregistrer(client, {type: 'ajout', note: {id: nouvelId(), cree_le: maintenant, modifie_le: maintenant, texte: texteAction(code, date, precision)}});
}

/** Annule une action pas encore recopiée dans le coffre. */
export async function annulerAction(client: string, note: Note): Promise<void> {
  await enregistrer(client, {type: 'suppression', id: note.id, avant: note.modifie_le}, true);
}
