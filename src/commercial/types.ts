// Données du panel commercial : contenu de _systeme/suivi.json (coffre « Loyna Prospection », script suivi.py),
// reçu chiffré (donnees.enc) et déchiffré dans le navigateur. Rien de tout cela n'est dans le dépôt du site.

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
  regles: {delai_recu_jours: number; delai_relance_jours: number; delai_appel_jours: number};
  totaux: Totaux;
  par_statut: {statut: string; nombre: number}[];
  par_action: {code: string; libelle: string; nombre: number}[];
  actions: {code: string; ordre: number; libelle: string}[];
  groupes_appel: {groupe: number; libelle: string}[];
  prospects: Prospect[];
  hors_fiches: {prospect: string; email: string; premier_mail: string; relance: string; echec: string; detail: string}[];
  ressources: {
    modeles: {titre: string; fichier: string; blocs: BlocModele[]}[];
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
