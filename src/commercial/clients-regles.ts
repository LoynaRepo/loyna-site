// Règles des clients du panel commercial, sans dépendance (testées par tools/commercial/test_clients.mjs) :
// actions notées dans le panel (« [CLIENT:qr_livres] 2026-10-30 · remis en main propre »), parcours et prochaine
// action recalculés dans le navigateur avec la date du jour. Même règle que _systeme/clients.py du coffre
// (prochaine_action) : toute modification se fait des deux côtés. Les données publiées avant la grille du 2026-10-31 (sans essai,
// ni suspension, ni services de Pro) restent lisibles : ces champs sont facultatifs.
import type {ActionClient, Client, CodeEtape, ContactEssai, EtapeClient, EvenementContact, ResultatContact, ServicePro, TotauxClients, Urgence} from './types';
import type {Note} from './notes-crypto';

export type CodeAction = 'commerce_cree' | 'documents' | 'qr_livres' | ServicePro['code'];
// etape : étape du parcours que l'action coche ; sans étape, c'est un service de Pro (Client.services_pro)
export const ACTIONS: Record<CodeAction, {etape?: CodeEtape; bouton: string; fait: string; precision: string; aide: string}> = {
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
  carte_finie: {
    bouton: 'Carte finie à la main',
    fait: 'Carte finie à la main',
    precision: 'Précision (facultatif)',
    aide: 'Logo retouché et, sur une carte à tampons, cachets à ses initiales. Une fois, sous 15 jours à partir du 1er paiement.',
  },
  video: {
    bouton: 'Vidéo et visuels envoyés',
    fait: 'Vidéo et visuels envoyés',
    precision: 'Précision (facultatif)',
    aide: 'Une vidéo et des visuels de sa carte, prêts à poster. Une fois, sous 15 jours à partir du 1er paiement.',
  },
  kit: {
    bouton: 'Kit comptoir envoyé',
    fait: 'Kit comptoir envoyé',
    precision: 'Précision (facultatif)',
    aide: '1 QR code sous verre par adresse, offert une fois. Avec engagement, après le 1er paiement ; sans engagement, après le 3e. Sous 15 jours ensuite.',
  },
};
export const MARQUE = '[CLIENT:';
const RE_ACTION = /^\s*\[CLIENT:([A-Za-z_]+)\][ \t]*(\d{4}-\d{2}-\d{2})?[ \t]*(?:[·:—–-][ \t]*)?([\s\S]*)$/;
const DELAI_URGENT = 3; // jours : en rouge à moins de 3 jours de la date limite des QR codes
const ORDRE: Record<string, number> = {paiement: 1, qr_urgent: 2, contact_essai: 3, commerce: 3, documents: 4, qr: 5, service_pro: 6, aucune: 9};
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
const sansAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Offre plus vendue, gardée par un client historique (Premium, Barber Kong). */
export const offreHistorique = (formule: string) => sansAccents(formule) === 'premium';
/** Libellé de l'offre : celui du coffre ; dans des données publiées avant la grille, Premium y est encore « mensuel ». */
export const libelleOffre = (o: Client['offre']) => (offreHistorique(o.formule) ? `${o.formule} · offre historique` : o.libelle);

function urgenceQr(limite: Date | null, auj: Date): {urgence: Urgence; detail: string} {
  if (!limite) return {urgence: '', detail: ''};
  const j = ecart(limite, auj);
  if (j < 0) return {urgence: 'retard', detail: `en retard de ${-j} j`};
  if (j === 0) return {urgence: 'bientot', detail: 'dernier jour aujourd’hui'};
  return {urgence: j < DELAI_URGENT ? 'bientot' : '', detail: `dans ${j} j`};
}

/** Prochaine action : même règle que prochaine_action() de _systeme/clients.py. `services` : les services de Pro, dans leur
 *  ordre ; le premier à faire passe après les documents et les QR codes. */
export function prochaineAction(
  etat: Client['etat'],
  faits: {commerce: boolean; documents: boolean; qr: boolean},
  qrCommandes: number,
  qrLimite: string,
  commerceExistant: boolean | null,
  auj: Date,
  services: ServicePro[] = [],
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
  if (etat?.code === 'essai') {
    // commerce et carte créés par le produit, aucun document pendant l'essai, mails envoyés par le produit
    const fin = jour(etat.date);
    return action('aucune', 'Rien à faire', `essai${fin ? ` jusqu’au ${jjmmaaaa(fin)}` : ''}`);
  }
  if (etat?.code === 'carte_suspendue') {
    const d = jour(etat.date);
    const motif = etat.motif ?? '';
    const detail = `carte en pause${d ? ` depuis le ${jjmm(d)}` : ''}${motif ? ` : ${motif}` : ''}`;
    if (sansAccents(motif).startsWith('paiement')) return action('paiement', 'Relancer le paiement', detail, 'retard');
    return action('aucune', 'Rien à faire', detail);
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
  const service = services.find((s) => s.a_faire);
  if (service) {
    const fin = jour(service.limite);
    const {urgence: urgenceService, detail: detailService} = urgenceQr(fin, auj);
    return action('service_pro', service.libelle, fin ? `avant le ${jjmm(fin)} (${detailService})` : '', urgenceService);
  }
  if (etat?.code === 'resiliation') {
    const effet = jour(etat.date);
    return action('aucune', 'Rien à faire', `résiliation demandée${effet ? `, fin le ${jjmmaaaa(effet)}` : ''}`);
  }
  return action('aucune', 'Rien à faire', 'client actif');
}

// --- Parcours de contact d'un essai : même table et même calcul que ETAPES_CONTACT et parcours_contact() de _systeme/clients.py -----------
export const ETAPES_CONTACT: {code: string; repere: 'debut' | 'fin'; jours: number; libelle: string; consigne: string}[] = [
  {code: 'j1', repere: 'debut', jours: 1, libelle: 'Appel de bienvenue', consigne: 'Vérifier que la carte est bonne et que le QR code est au comptoir.'},
  {code: 'j7', repere: 'debut', jours: 7, libelle: 'Recueillir un retour', consigne: 'Combien de clients inscrits ? Qu’est-ce qui bloque ?'},
  {code: 'jm10', repere: 'fin', jours: -10, libelle: 'Présenter l’offre', consigne: 'Starter ou Pro, avec le lien du panier.'},
  {code: 'jm3', repere: 'fin', jours: -3, libelle: 'Dernier appel avant l’arrêt', consigne: 'Sans abonnement, la carte se met en pause à la fin de l’essai.'},
  {code: 'fin2', repere: 'fin', jours: 2, libelle: 'Relance après l’arrêt', consigne: 'La carte est en pause, elle repart dès l’abonnement.'},
  {code: 'fin30', repere: 'fin', jours: 30, libelle: 'Dernière relance', consigne: 'Après celle-ci, plus aucun contact.'},
];
export const RESULTATS_CONTACT: Record<ResultatContact, string> = {joint: 'Joint', sans_reponse: 'Pas de réponse', rappeler: 'À rappeler', pas_interesse: 'Pas intéressé'};
const REPORTS_MAX = 3; // « Pas de réponse » : l'étape revient le lendemain, 3 fois au plus ; un 4e « Pas de réponse » la fait passer
const DELAI_DERNIERE = 7; // dernière étape jamais notée : elle quitte la liste 7 jours après sa date
const RE_CONTACT = /^(j1|j7|jm10|jm3|fin2|fin30)\s+(joint|sans_reponse|rappeler|pas_interesse)(?:\s+(\d{4}-\d{2}-\d{2}))?\s*(?:·\s*([\s\S]*))?$/;

const plusJours = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** « [CLIENT:essai_contact] 2026-11-08 · j7 rappeler 2026-11-12 · il rappelle mardi » */
export function texteContact(etape: string, resultat: ResultatContact, date: string, rappel: string, retour: string): string {
  const r = retour.replace(/\s+/g, ' ').trim();
  return `${MARQUE}essai_contact] ${date} · ${etape} ${resultat}${rappel ? ` ${rappel}` : ''}${r ? ` · ${r}` : ''}`;
}

export function contactDeNote(n: Note): EvenementContact | null {
  const a = RE_ACTION.exec(n.texte);
  if (!a || a[1].toLowerCase() !== 'essai_contact') return null;
  const m = RE_CONTACT.exec(a[3].replace(/\s+/g, ' ').trim());
  if (!m) return null;
  return {etape: m[1], resultat: m[2] as ResultatContact, date: a[2] ?? (n.cree_le || '').slice(0, 10), rappel: m[3] ?? '', id: n.id, texte: (m[4] ?? '').trim(), note: n};
}

/** Où en est le parcours : voir parcours_contact() de clients.py. */
export function parcoursContact(debutIso: string, finIso: string, evenements: EvenementContact[], auj: Date, arretPublie = ''): Omit<ContactEssai, 'liens_panier'> {
  const j = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
  const debut = jour(debutIso);
  const fin = jour(finIso);
  const tries = [...evenements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const arret = arretPublie || (tries.some((e) => e.resultat === 'pas_interesse') ? 'pas_interesse' : '');
  const prevus = ETAPES_CONTACT.flatMap((e) => {
    const base = e.repere === 'debut' ? debut : fin;
    return base ? [{...e, prevu: plusJours(base, e.jours)}] : [];
  });
  let courante = '';
  const etapes = prevus.map((e, k) => {
    const evs = tries.filter((x) => x.etape === e.code);
    let echeance = e.prevu;
    for (const x of evs) {
      const d = jour(x.date);
      if (x.resultat === 'rappeler') echeance = jour(x.rappel) ?? (d ? plusJours(d, 1) : echeance);
      else if (x.resultat === 'sans_reponse' && d) echeance = plusJours(d, 1) > e.prevu ? plusJours(d, 1) : e.prevu; // appel fait en avance : l'étape garde sa date
    }
    const absences = evs.filter((x) => x.resultat === 'sans_reponse').length;
    const suivant = prevus[k + 1]?.prevu;
    let etat: 'fait' | 'passe' | 'courante' | 'a_venir';
    if (evs.some((x) => x.resultat === 'joint')) etat = 'fait';
    else if (absences > REPORTS_MAX) etat = 'passe';
    else if (courante) etat = 'a_venir';
    else if (
      (suivant && suivant <= j && (echeance < suivant || echeance < j)) ||
      ((e.code === 'jm10' || e.code === 'jm3') && fin! < j && echeance < j) ||
      (!suivant && ecart(j, echeance) > DELAI_DERNIERE)
    )
      etat = 'passe';
    else {
      etat = 'courante';
      courante = e.code;
    }
    return {code: e.code, libelle: e.libelle, consigne: e.consigne, prevu: isoJour(e.prevu), echeance: isoJour(echeance), etat, absences};
  });
  const enCours = arret ? undefined : etapes.find((e) => e.etat === 'courante');
  const echeance = enCours ? jour(enCours.echeance) : null;
  return {
    debut: debutIso,
    fin: finIso,
    arret,
    etapes,
    evenements: tries,
    courante: enCours?.code ?? '',
    echeance: enCours?.echeance ?? '',
    a_contacter: !!echeance && echeance <= j,
    retard: echeance ? Math.max(ecart(j, echeance), 0) : 0,
    termine: !arret && !enCours,
  };
}

/** Prochaine action d'un essai : voir action_contact() de clients.py. */
export function actionContact(contact: Omit<ContactEssai, 'liens_panier'> | null | undefined, action: ActionClient): ActionClient {
  if (!contact || action.code !== 'aucune' || contact.arret === 'abonne') return action;
  const etape = contact.etapes.find((e) => e.code === contact.courante);
  if (contact.arret === 'pas_interesse') return {...action, detail: 'pas intéressé : plus aucun contact'};
  if (contact.arret === 'stop') return {...action, detail: 'liste STOP : plus aucun contact'};
  if (!etape) return contact.termine ? {...action, detail: 'parcours de contact terminé'} : action;
  if (!contact.a_contacter) return {...action, detail: `${action.detail} ; prochain contact le ${jjmm(jour(etape.echeance)!)} : ${etape.libelle}`};
  const detail = `${contact.retard ? `en retard de ${contact.retard} j. ` : 'aujourd’hui. '}${etape.consigne}`;
  return {code: 'contact_essai', ordre: ORDRE.contact_essai, libelle: etape.libelle, detail, urgence: contact.retard ? 'retard' : ''};
}

/** Parcours à la date du jour : événements recopiés dans la fiche + notes du panel. Le texte des retours vient des notes. */
function contactAJour(c: ContactEssai, notes: Note[], auj: Date): ContactEssai {
  const parNote = new Map<string, EvenementContact>();
  for (const n of [...notes].sort((a, b) => (a.cree_le || '').localeCompare(b.cree_le || ''))) {
    const e = contactDeNote(n);
    if (e) parNote.set(e.id, e);
  }
  const connus = new Set(c.evenements.map((e) => e.id));
  const evenements: EvenementContact[] = [
    ...c.evenements.map((e) => ({...e, texte: parNote.get(e.id)?.texte ?? e.texte ?? '', note: undefined})),
    ...[...parNote.values()].filter((e) => !connus.has(e.id)),
  ];
  const arretPublie = c.arret === 'pas_interesse' ? '' : c.arret;
  return {...parcoursContact(c.debut, c.fin, evenements, auj, arretPublie), liens_panier: c.liens_panier};
}

export interface ClientAffiche extends Client {
  enAttente: Partial<Record<CodeAction, ActionNotee>>; // notées dans le panel, pas encore dans le coffre
}

/** Client tel qu'affiché : actions notées dans le panel prises en compte, prochaine action à la date du jour. */
export function clientAJour(c: Client, notes: Note[], auj = new Date()): ClientAffiche {
  const notees = actionsNotees(notes, c.qr.lot_le ?? '');
  const enAttente: ClientAffiche['enAttente'] = {};
  const parcours: EtapeClient[] = c.parcours.map((e) => ({...e}));
  const services: ServicePro[] = (c.services_pro ?? []).map((s) => ({...s}));
  for (const [code, a] of Object.entries(notees) as [CodeAction, ActionNotee][]) {
    const e = parcours.find((x) => x.code === ACTIONS[code].etape);
    if (e && !e.fait) {
      e.fait = true;
      e.date = a.date;
      e.attente = true;
      enAttente[code] = a;
    }
    const s = services.find((x) => x.code === code);
    if (s && !s.fait_le) {
      s.fait_le = a.date;
      s.attente = true;
      enAttente[code] = a;
    }
  }
  // même calcul que services_pro() du coffre, à la date du jour : un service fait n'est plus à faire
  const aujIso = isoJour(auj);
  for (const s of services) s.a_faire = !s.fait_le && s.du_le <= aujIso;
  const fait = (code: CodeEtape) => !!parcours.find((x) => x.code === code)?.fait;
  const actif = parcours.find((x) => x.code === 'actif');
  const etapes = parcours.filter((x) => x.code !== 'actif');
  if (actif) {
    // date : la dernière étape franchie (la commande n'en fait pas partie, comme dans le coffre)
    const dates = etapes.filter((x) => x.code !== 'commande' && x.date).map((x) => x.date.slice(0, 10));
    actif.fait = etapes.every((x) => x.fait) && !c.essai?.en_cours;
    actif.date = actif.fait ? (dates.sort().pop() ?? '') : '';
  }
  const enCours = (parcours.find((x) => !x.fait)?.code ?? 'actif') as CodeEtape;
  const qrFait = fait('qr');
  const aLivrer = c.qr.commandes && !qrFait && c.abonnement_en_cours ? c.qr.commandes : 0;
  const limite = jour(c.qr.limite);
  const finEssai = jour(c.essai?.fin ?? '');
  const contact = c.contact_essai ? contactAJour(c.contact_essai, notes, auj) : c.contact_essai;
  return {
    ...c,
    parcours,
    etape: {code: enCours, libelle: LIBELLES_ETAPE[enCours]},
    contact_essai: contact,
    action: actionContact(contact, prochaineAction(c.etat, {commerce: fait('commerce'), documents: fait('documents'), qr: qrFait}, c.qr.commandes, c.qr.limite, c.commerce_existant, auj, services)),
    qr: {...c.qr, a_livrer: aLivrer, jours_restants: aLivrer && limite ? ecart(limite, auj) : null},
    services_pro: services,
    ...(c.essai ? {essai: {...c.essai, jours_restants: c.essai.en_cours && finEssai ? ecart(finEssai, auj) : null}} : {}),
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
    essais: cs.filter((c) => c.etat?.code === 'essai').length,
    essais_a_contacter: cs.filter((c) => c.contact_essai?.a_contacter).length,
    essais_en_retard: cs.filter((c) => c.contact_essai?.retard).length,
    essais_abonnes: cs.filter((c) => c.contact_essai?.arret === 'abonne').length,
    cartes_suspendues: cs.filter((c) => c.etat?.code === 'carte_suspendue').length,
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
