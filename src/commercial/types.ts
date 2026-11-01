// Données du panel commercial : contenu de _systeme/suivi.json (coffre « Loyna Prospection », script suivi.py),
// reçu chiffré (donnees.enc) et déchiffré dans le navigateur. Rien de tout cela n'est dans le dépôt du site.

import type {Note} from './notes-crypto';

export type EtatReception = 'oui' | 'non' | 'en attente' | '—';

export interface Telephone {
  affiche: string; // « 06 39 98 12 34 »
  lien: string; // « +33639981234 »
  type: 'mobile' | 'fixe';
}

export interface Appel {
  groupe: 1 | 2 | 3 | 4;
  groupe_libelle: string;
  motif: string;
  a_dire: string[];
  objectif: string;
  dirigeant_registre: string;
  rang: number;
}

export interface Prospect {
  id: string;
  fiche: string;
  nom: string;
  secteur: string;
  famille: string;
  ville: string;
  adresse: string;
  dirigeant: string;
  prenom: string;
  siren: string;
  site: string;
  instagram: string;
  facebook: string;
  linkedin: string;
  telephone: string;
  telephones: Telephone[];
  telephone_type: '' | 'mobile' | 'fixe';
  tel_principal: Telephone | null;
  email: string;
  email_valide: boolean;
  email_statut: string;
  score: number | null;
  statut: string;
  cible: 'oui' | 'non' | 'à revoir';
  cible_motif: string;
  revu_le: string;
  liste_stop: boolean;
  variante: string;
  source: string;
  envoi: {envoye: boolean; date: string; objet: string};
  reception: {etat: EtatReception; motif: string; date: string};
  reponse: {recue: boolean; date: string; resume: string; traitee: boolean | null};
  relance: {envoyee: boolean; date: string; prevue: string};
  rdv: string;
  file_envoi: {type: string; etat: string; raison: string; date: string}[];
  action: {code: string; ordre: number; libelle: string; detail: string};
  appel: Appel | null;
  derniere_activite: string;
  historique: string[];
  sources: string[];
  notes?: Note[]; // notes du panel recopiées à la dernière publication (secours en lecture seule)
  client_id?: string | null; // statut « client » : sa fiche dans 08 Clients (onglet Clients)
  activite_carte?: string; // activité de sa carte (loyna_mail.activite_pour) : visuel du mail perso, prérempli
  mail_perso?: {le: string; etat: string}; // dernier mail perso (propriétés mail_perso_le et mail_perso_etat de la fiche)
  mails_perso?: EtatMailPerso[]; // mails perso traités par le coffre (_systeme/mail_perso.py), le plus récent d'abord
}

/** Mail perso après un appel (note « [MAIL] » du panel), une fois traité par le coffre. */
export interface EtatMailPerso {
  note: string; // identifiant de la note « [MAIL] »
  etat: 'en cours' | 'envoyé' | 'erreur' | string;
  le: string; // AAAA-MM-JJTHH:MM:SS (heure de Paris) : envoi, ou échec
  demande_le: string; // création de la note (ISO 8601, UTC)
  raison: string; // échec : pourquoi
  objet: string;
  to: string;
  signataire: string;
}

// --- Clients (08 Clients du coffre, calculés par _systeme/clients.py) --------------------------------------
export type CodeEtape = 'commande' | 'commerce' | 'documents' | 'qr' | 'actif';
export type Urgence = '' | 'bientot' | 'retard';

export interface EtapeClient {
  code: CodeEtape;
  libelle: string;
  date: string; // AAAA-MM-JJ (ou AAAA-MM-JJTHH:MM)
  fait: boolean;
  sans_objet: boolean; // QR codes : aucun commandé
  attente?: boolean; // noté dans le panel, pas encore recopié dans le coffre (calculé dans le navigateur)
}

export interface ActionClient {
  code: 'paiement' | 'commerce' | 'documents' | 'qr' | 'service_pro' | 'aucune';
  ordre: number;
  libelle: string;
  detail: string;
  urgence: Urgence;
}

export interface EtatClient {
  code: 'essai' | 'carte_suspendue' | 'paiement_echoue' | 'resiliation' | 'termine';
  libelle: string;
  date: string; // fin de l'essai / carte suspendue le / paiement échoué le / fin de l'abonnement
  demande_le?: string;
  motif?: string; // carte suspendue : essai terminé, paiement échoué ou abonnement terminé
}

/** Service de Pro à livrer une fois (clients.py, SERVICES_PRO) : dû à partir de `du_le`, sous 15 jours. */
export interface ServicePro {
  code: 'carte_finie' | 'video' | 'kit';
  libelle: string;
  du_le: string;
  limite: string;
  fait_le: string;
  a_faire: boolean;
  attente?: boolean; // noté dans le panel, pas encore recopié dans le coffre (calculé dans le navigateur)
}

export interface Client {
  id: string; // 12 caractères (notes chiffrées du panel)
  fiche: string;
  commerce: string;
  activite: string;
  contact: {prenom: string; nom: string; complet: string};
  email: string;
  telephone: string;
  telephones: Telephone[];
  tel_principal: Telephone | null;
  adresse_facturation: string;
  siren: string;
  siret?: string; // client venu d'un essai
  instagram?: string;
  // mensuel : revenu du mois, 0 pendant un essai ; historique : offre plus vendue (Premium, Barber Kong). Données publiées avant la
  // grille du 2026-10-31 : ni engagement ni historique, voir libelleOffre() dans clients-regles.ts
  offre: {formule: string; periodicite: string; engagement?: boolean; historique?: boolean; libelle: string; prix: number | null; mensuel: number | null};
  essai?: {en_cours: boolean; demarre_le: string; fin: string; jours_restants: number | null};
  suspension?: {le: string; motif: string; reactivee_le: string};
  services_pro?: ServicePro[];
  date_souscription: string;
  montant_paye: string;
  code_promo: string;
  parrainage_filleul?: string; // code du parrain si ce client est un filleul (Parrainage LOYNA : premier mois offert)
  paiement: {statut: string; echoue_le: string; document: string};
  engagement: {actif?: boolean; fin: string; libelle: string}; // sans engagement : aucune date de fin
  compte: string; // e-mail du compte de l'espace client
  lien_espace_client: string;
  commerce_existant: boolean | null;
  identifiant_commerce: string;
  lien_inscription: string;
  stripe: {session: string; abonnement: string; client: string; facture: string; liens: {libelle: string; href: string}[]};
  // lot_le : début du lot en cours quand un QR offert (Parrainage LOYNA) suit une première livraison
  qr: {commandes: number; detail: string; limite: string; livres_le: string; a_livrer: number; jours_restants: number | null; lot_le?: string};
  parcours: EtapeClient[];
  etape: {code: CodeEtape; libelle: string};
  etat: EtatClient | null;
  action: ActionClient;
  abonnement_en_cours: boolean;
  mrr: number;
  programme: {nom: string; recompense: string; passages: string};
  couleurs?: {fond: string; accent: string};
  /** Liens d'ajout des cartes de démonstration (propriétés carte_demo_apple / carte_demo_google de la fiche). */
  cartes_demo?: {apple: string; google: string};
  statut: string;
  documents_generes_le: string;
  prospect: string;
  prospect_id?: string | null;
  historique: string[];
  derniere_activite: string;
  notes?: Note[];
}

export interface TotauxClients {
  clients: number;
  actifs: number;
  mrr: number;
  qr_a_livrer: number;
  qr_clients: number;
  en_retard: number;
  urgents: number;
  a_traiter: number;
  resiliations?: number;
  essais?: number;
  cartes_suspendues?: number;
  par_etape: {code: string; libelle: string; nombre: number}[];
  par_offre: {formule: string; nombre: number}[];
}

export interface Totaux {
  prospects: number;
  cibles: number;
  envoyes: number;
  recus: number;
  en_attente_reception: number;
  non_recus: number;
  reponses: number;
  reponses_a_traiter: number;
  taux_reponse: number | null;
  taux_reponse_recus: number | null;
  rdv: number;
  a_appeler: number;
  a_appeler_mobiles: number;
  a_relancer: number;
  a_relancer_en_file: number;
  relances_envoyees: number;
  premiers_mails_a_ecrire: number;
  file_envoi: {en_file: number; en_file_premiers: number; en_file_relances: number; a_verifier: number; refuses: number};
  contacts_hors_fiches: number;
  notes?: number;
  prospects_avec_notes?: number;
  devenus_clients?: number;
}

export interface BlocModele {
  type: 'texte' | 'mail' | 'code';
  md?: string;
  titre?: string;
  texte?: string;
}

export interface Suivi {
  version: number;
  genere_le: string;
  aujourdhui: string;
  coffre: string;
  exemple?: boolean;
  regles: {delai_recu_jours: number; delai_relance_jours: number; delai_appel_jours: number; delai_abandon_jours?: number};
  totaux: Totaux;
  par_statut: {statut: string; nombre: number}[];
  par_action: {code: string; libelle: string; nombre: number}[];
  actions: {code: string; ordre: number; libelle: string}[];
  groupes_appel: {groupe: number; libelle: string}[];
  prospects: Prospect[];
  clients?: Client[]; // absent des données publiées avant le 2026-10-27
  totaux_clients?: TotauxClients;
  hors_fiches:{prospect: string; email: string; premier_mail: string; relance: string; echec: string; detail: string}[];
  notes_orphelines?: {prospect: string; notes: Note[]}[];
  notes_panel?: {cle: string; version: number}; // clé des notes, ajoutée par panel.py au moment du chiffrement
  ressources: {
    modeles: {titre: string; fichier: string; blocs: BlocModele[]}[];
    mail_perso?: {objet: string; html: string} | null; // modèle « Mail perso après appel » (aperçu du compositeur)
    faq_coffre: {q: string; r: string; pieces: string[]}[];
    accroches: {secteur: string; accroche: string}[];
    agenda: {jours_rdv?: string[] | string; plages?: string; duree_rdv_min?: string; marge_min?: string; delai_min_heures?: string};
    envoi: {quota_jour?: string; quota_initial_jour?: string; jours_envoi?: string[] | string; heure_debut?: string; heure_fin?: string; pause_envois?: string};
    agents: {tache: string; horaire: string; consigne: string}[];
  };
}

/** FAQ du site (Builder.io ou src/content-seed/faq.json), passée par la page au moment de la construction. */
export interface FaqSite {
  q: string;
  a: string;
  categorie?: string;
}
