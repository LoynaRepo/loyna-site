// Règles des clients du panel commercial, sans dépendance (testées par tools/commercial/test_clients.mjs) :
// actions notées dans le panel (« [CLIENT:qr_livres] 2026-10-30 · remis en main propre »), parcours et prochaine
// action recalculés dans le navigateur avec la date du jour. Même règle que _systeme/clients.py du coffre
// (prochaine_action) : toute modification se fait des deux côtés.
import type {ActionClient, Client, CodeEtape, EtapeClient, TotauxClients, Urgence} from './types';
import type {Note} from './notes-crypto';

export type CodeAction = 'commerce_cree' | 'documents' | 'qr_livres';
export const ACTIONS: Record<CodeAction, {etape: CodeEtape; bouton: string; fait: string; precision: string; aide: string}> = {
  commerce_cree: {
    etape: 'commerce',
    bouton: 'Commerce créé',
    fait: 'Commerce et carte créés',
    precision: 'Identifiant du commerce (facultatif)',
    aide: 'Celui du lien d’inscription loyna.fr/join/…, menu Réglages de l’espace client.',
  },
  documents: {
    etape: 'documents',
    bouton: 'Documents envoyés',
    fait: 'Documents envoyés',
    precision: 'Précision (facultatif)',
    aide: 'Normalement inutile : documents_client.py envoyer le note tout seul. À utiliser pour un envoi fait autrement.',
  },
  qr_livres: {
    etape: 'qr',
    bouton: 'QR codes livrés',
    fait: 'QR codes livrés',
    precision: 'Précision (facultatif)',
    aide: 'Remis en main propre, envoyés par la poste…',
  },
};
export const MARQUE = '[CLIENT:';
const RE_ACTION = /^\s*\[CLIENT:([A-Za-z_]+)\][ \t]*(\d{4}-\d{2}-\d{2})?[ \t]*(?:[·:—–-][ \t]*)?([\s\S]*)$/;
const DELAI_URGENT = 3; // jours : en rouge à moins de 3 jours de la date limite des QR codes
const ORDRE: Record<string, number> = {paiement: 1, qr_urgent: 2, commerce: 3, documents: 4, qr: 5, aucune: 9};
export const LIBELLES_ETAPE: Record<CodeEtape, string> = {
  commande: 'Nouvelle commande',
  commerce: 'Commerce à créer',
  documents: 'Documents à envoyer',
  qr: 'QR codes à livrer',
  actif: 'Client actif',
};

export interface ActionNotee {
  code: CodeAction;
  date: string;
  texte: string;
  note: Note;
}

/** Note d'action (n'importe quel « [CLIENT:…] », comme est_note_action() du coffre) : jamais dans la liste des notes. */
export const estNoteAction = (n: Note) => RE_ACTION.test(n.texte);

export function lireAction(n: Note): ActionNotee | null {
  const m = RE_ACTION.exec(n.texte);
  if (!m) return null;
  const code = m[1].toLowerCase() as CodeAction;
  if (!(code in ACTIONS)) return null;
  return {code, date: m[2] ?? (n.cree_le || '').slice(0, 10), texte: m[3].replace(/\s+/g, ' ').trim(), note: n};
}

export function texteAction(code: CodeAction, date: string, precision: string): string {
  const p = precision.replace(/\s+/g, ' ').trim();
  return `${MARQUE}${code}] ${date}${p ? ` · ${p}` : ''}`;
}

/**
 * Actions notées pour un client (la première de chaque sorte compte, comme dans le coffre). `qrLotLe` : début du
 * lot de QR codes en cours (QR offert par le Parrainage LOYNA après une première livraison, `qr.lot_le`) ; une note
 * « QR codes livrés » datée d'avant ne compte plus, comme dans appliquer_actions_panel() du coffre.
 */
export function actionsNotees(notes: Note[], qrLotLe = ''): Partial<Record<CodeAction, ActionNotee>> {
  const out: Partial<Record<CodeAction, ActionNotee>> = {};
  for (const n of [...notes].sort((a, b) => (a.cree_le || '').localeCompare(b.cree_le || ''))) {
    const a = lireAction(n);
    if (a && a.code === 'qr_livres' && qrLotLe && a.date < qrLotLe.slice(0, 10)) continue;
    if (a && !out[a.code]) out[a.code] = a;
  }
  return out;
}

// --- Dates (AAAA-MM-JJ, sans fuseau) --------------------------------------------------------------------
function jour(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function ecart(limite: Date, auj: Date): number {
  const a = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
  return Math.round((limite.getTime() - a.getTime()) / 86400000);
}
const deux = (n: number) => String(n).padStart(2, '0');
const jjmm = (d: Date) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}`;
const jjmmaaaa = (d: Date) => `${jjmm(d)}/${d.getFullYear()}`;
export const isoJour = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

function urgenceQr(limite: Date | null, auj: Date): {urgence: Urgence; detail: string} {
  if (!limite) return {urgence: '', detail: ''};
  const j = ecart(limite, auj);
  if (j < 0) return {urgence: 'retard', detail: `en retard de ${-j} j`};
  if (j === 0) return {urgence: 'bientot', detail: 'dernier jour aujourd’hui'};
  return {urgence: j < DELAI_URGENT ? 'bientot' : '', detail: `dans ${j} j`};
}

/** Prochaine action : même règle que prochaine_action() de _systeme/clients.py. */
export function prochaineAction(
  etat: Client['etat'],
  faits: {commerce: boolean; documents: boolean; qr: boolean},
  qrCommandes: number,
  qrLimite: string,
  commerceExistant: boolean | null,
  auj: Date,
): ActionClient {
  const action = (code: ActionClient['code'], libelle: string, detail = '', urgence: Urgence = '', ordre?: number): ActionClient => ({
    code,
    ordre: ordre ?? ORDRE[code],
    libelle,
    detail,
    urgence,
  });
  if (etat?.code === 'termine') {
    const fin = jour(etat.date);
    return action('aucune', 'Rien à faire', `abonnement terminé${fin ? ` le ${jjmmaaaa(fin)}` : ''}`);
  }
  if (etat?.code === 'paiement_echoue') {
    const d = jour(etat.date);
    return action('paiement', 'Relancer le paiement', `paiement échoué${d ? ` le ${jjmm(d)}` : ''}`, 'retard');
  }
  const aLivrer = qrCommandes && !faits.qr ? qrCommandes : 0;
  const limite = jour(qrLimite);
  const {urgence, detail: detailQr} = aLivrer ? urgenceQr(limite, auj) : {urgence: '' as Urgence, detail: ''};
  const livrer = `Livrer ${aLivrer} QR code${aLivrer > 1 ? 's' : ''}${limite ? ` avant le ${jjmm(limite)}` : ''}`;
  if (!faits.commerce) {
    let detail = commerceExistant ? 'le commerce existe déjà dans l’espace client' : 'et la carte, avec l’e-mail du compte client';
    if (aLivrer && limite) detail += ` ; QR codes à livrer avant le ${jjmm(limite)}`;
    return action('commerce', commerceExistant ? 'Créer la carte' : 'Créer le commerce', detail, urgence);
  }
  if (aLivrer && urgence) return action('qr', livrer, detailQr, urgence, ORDRE.qr_urgent);
  if (!faits.documents) return action('documents', 'Envoyer les documents', 'documents_client.py envoyer');
  if (aLivrer) return action('qr', livrer, detailQr);
  if (etat?.code === 'resiliation') {
    const effet = jour(etat.date);
    return action('aucune', 'Rien à faire', `résiliation demandée${effet ? `, fin le ${jjmmaaaa(effet)}` : ''}`);
  }
  return action('aucune', 'Rien à faire', 'client actif');
}

export interface ClientAffiche extends Client {
  enAttente: Partial<Record<CodeAction, ActionNotee>>; // notées dans le panel, pas encore dans le coffre
}

/** Client tel qu'affiché : actions notées dans le panel prises en compte, prochaine action à la date du jour. */
export function clientAJour(c: Client, notes: Note[], auj = new Date()): ClientAffiche {
  const notees = actionsNotees(notes, c.qr.lot_le ?? '');
  const enAttente: ClientAffiche['enAttente'] = {};
  const parcours: EtapeClient[] = c.parcours.map((e) => ({...e}));
  for (const [code, a] of Object.entries(notees) as [CodeAction, ActionNotee][]) {
    const e = parcours.find((x) => x.code === ACTIONS[code].etape);
    if (e && !e.fait) {
      e.fait = true;
      e.date = a.date;
      e.attente = true;
      enAttente[code] = a;
    }
  }
  const fait = (code: CodeEtape) => !!parcours.find((x) => x.code === code)?.fait;
  const actif = parcours.find((x) => x.code === 'actif');
  const etapes = parcours.filter((x) => x.code !== 'actif');
  if (actif) {
    // date : la dernière étape franchie (la commande n'en fait pas partie, comme dans le coffre)
    const dates = etapes.filter((x) => x.code !== 'commande' && x.date).map((x) => x.date.slice(0, 10));
    actif.fait = etapes.every((x) => x.fait);
    actif.date = actif.fait ? (dates.sort().pop() ?? '') : '';
  }
  const enCours = (parcours.find((x) => !x.fait)?.code ?? 'actif') as CodeEtape;
  const qrFait = fait('qr');
  const aLivrer = c.qr.commandes && !qrFait && c.abonnement_en_cours ? c.qr.commandes : 0;
  const limite = jour(c.qr.limite);
  return {
    ...c,
    parcours,
    etape: {code: enCours, libelle: LIBELLES_ETAPE[enCours]},
    action: prochaineAction(c.etat, {commerce: fait('commerce'), documents: fait('documents'), qr: qrFait}, c.qr.commandes, c.qr.limite, c.commerce_existant, auj),
    qr: {...c.qr, a_livrer: aLivrer, jours_restants: aLivrer && limite ? ecart(limite, auj) : null},
    enAttente,
  };
}

/** Totaux des compteurs (mêmes définitions que totaux() de clients.py). */
export function totauxClients(cs: Client[]): Omit<TotauxClients, 'par_etape' | 'par_offre'> {
  const enCours = cs.filter((c) => c.abonnement_en_cours);
  return {
    clients: cs.length,
    actifs: enCours.length,
    mrr: Math.round(enCours.reduce((s, c) => s + (c.mrr || 0), 0) * 100) / 100,
    qr_a_livrer: cs.reduce((s, c) => s + c.qr.a_livrer, 0),
    qr_clients: cs.filter((c) => c.qr.a_livrer > 0).length,
    en_retard: cs.filter((c) => c.action.urgence === 'retard').length,
    urgents: cs.filter((c) => c.action.urgence !== '').length,
    a_traiter: cs.filter((c) => c.action.code !== 'aucune').length,
    resiliations: cs.filter((c) => c.etat?.code === 'resiliation').length,
  };
}

const RANG_URGENCE: Record<Urgence, number> = {retard: 0, bientot: 1, '': 2};
/** Ordre de la liste : urgences d'abord, puis l'action, la date limite des QR codes et la date de commande. */
export function trierClients<T extends Client>(cs: T[]): T[] {
  return [...cs].sort(
    (a, b) =>
      RANG_URGENCE[a.action.urgence] - RANG_URGENCE[b.action.urgence] ||
      a.action.ordre - b.action.ordre ||
      (a.qr.limite || '9999').localeCompare(b.qr.limite || '9999') ||
      (a.date_souscription || '9999').localeCompare(b.date_souscription || '9999') ||
      a.commerce.localeCompare(b.commerce, 'fr'),
  );
}
