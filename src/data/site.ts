// Données centrales du site. Les textes modifiables par l'équipe viennent de Builder.io
// (voir src/lib/builder.ts) ; ce fichier donne les valeurs par défaut et tout ce qui est technique.

export const SITE = {
  name: 'LOYNA',
  url: 'https://loyna.fr',
  slogan: 'Faites revenir vos clients, sans complexité.',
  tagline: 'Loyal customers. Brighter tomorrows.',
  description:
    'Carte de fidélité digitale Apple Wallet et Google Wallet, avec notification de proximité, dès 29 € par mois, sans TVA. Sans application, prête sous 24 h.',
  email: 'contact@loyna.fr',
  city: 'Montpellier',
  region: 'Occitanie',
  locale: 'fr_FR',
  vatNote: 'TVA non applicable, art. 293 B du CGI',
  // Identité légale : à compléter dans Builder.io (modèle « site-settings ») ou ici.
  legal: {
    nomDirigeant: 'Ewan Touquet',
    nomCommercial: 'KOVA Elec',
    siret: '932 811 839 00020',
    adresse: 'C 07, 137 rue Uderzo, 34690 Fabrègues',
    telephone: '',
  },
  // Adresse postale (registre SIRENE, siège de l'entreprise)
  address: {street: 'C 07, 137 rue Uderzo', postalCode: '34690', locality: 'Fabrègues', region: 'Occitanie', country: 'FR'},
  // Mesure d'audience Google Analytics 4 (« G-… ») : vide = aucun bandeau ni traceur. Modifiable dans Builder.
  ga4Id: 'G-8YTGCX1EQ1', // propriété « LOYNA » créée par Ewan le 2026-10-28
  // Référencement : codes de vérification (Search Console, Bing) et profils officiels de la marque.
  // Modifiables aussi dans Builder (site-settings : googleVerification, bingVerification, sameAs).
  googleVerification: '',
  bingVerification: '',
  // Comptes officiels de LOYNA (donnés par Ewan le 2026-10-28) : données structurées et liens du pied de page.
  // Fiche Google Business Profile « Loyna » (donnée par Ewan le 2026-10-29, identifiant Knowledge Graph /g/11z_20p3cp) :
  // données structurées seulement (le pied de page ne garde qu'Instagram et TikTok).
  sameAs: [
    'https://www.instagram.com/loyna.fr/',
    'https://www.tiktok.com/@loyna.fr',
    'https://www.google.com/search?kgmid=/g/11z_20p3cp',
  ] as string[],
  // Espace commerçant (LOYNA Business) : laissé vide tant que l'application n'est pas en ligne.
  appUrl: '',
  // Portail Stripe (abonnement, factures, moyen de paiement) : rempli après création du portail.
  billingPortalUrl: 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00',
};

// Fondateur : page « À propos », auteur des articles et données structurées (Organization.founder, BlogPosting.author).
// sameAs : ses profils publics (LinkedIn…), vides tant qu'Ewan ne les a pas donnés.
// TODO Ewan : l'associé (nom complet et accord pour être cité) et les photos, à ajouter ici et sur /a-propos/.
export const FONDATEUR = {
  nom: 'Ewan Touquet',
  titre: 'Fondateur de LOYNA',
  page: '/a-propos/',
  id: `${SITE.url}/a-propos/#ewan-touquet`,
  sameAs: [] as string[],
};

// Offres Starter et Pro : source de vérité dans le dépôt LOYNA, docs/OFFRES.md (décision d'Ewan du 2026-10-31). Ne rien
// ajouter ici qui n'y figure pas. Premium n'est plus vendue : voir LEGACY_PLANS.
export type PlanId = 'starter' | 'pro';

// Toujours réglé au mois, plus d'annuel payé d'avance : sans engagement, ou avec 12 mois d'engagement (ENGAGEMENT).
export type Engagement = 'sans' | 'engage';

export interface Plan {
  id: PlanId;
  name: string;
  badge: string;
  /** Phrase de vente de l'offre (PHRASES). */
  tagline: string;
  monthly: number; // € par mois sans engagement (sans TVA : franchise en base, art. 293 B du CGI)
  engaged: number; // € par mois avec 12 mois d'engagement (-15 %), sans TVA
  /** Cartes clients (clients inscrits au programme) : illimitées dans toutes les offres. */
  cards: null;
  /** Campagnes de notifications par semaine, quel que soit le nombre de destinataires (compteur remis à zéro chaque
   *  lundi, décision d'Ewan du 2026-10-30) ; null = illimitées. */
  campaignsPerWeek: number | null;
  /** Boutiques (adresses), chacune avec la notification de proximité. */
  shops: number;
  /** Même phrase que `tagline`, pour les écrans qui affichent déjà `pitch`. */
  pitch: string;
  intro?: string;
  /** Bloc mis en avant dans la grille tarifaire : ce qui part tout seul (Starter), ce que Pro ajoute. */
  focus?: {title: string; items: string[]};
  features: string[];
  /** Offre mise en avant (Starter), jamais « la plus choisie » : aucun chiffre de ce type n'existe. */
  highlight?: boolean;
  // Liens de paiement Stripe, retour vers /merci/?offre=<id>-mensuel|engage. On achète par le panier (/panier/) ; ces
  // liens lui servent de secours. Code LANCEMENT2026 prérempli sur `sans` seulement : `engage` n'a pas de mise en service.
  links: {sans: string; engage: string};
}

// Couleurs proposées pour la carte (configurateur, haut de l'accueil, page Fonctionnalités)
export const CARD_BGS = [
  {c: '#1f1c17', nom: 'Noir chaud'},
  {c: '#121216', nom: 'Noir'},
  {c: '#7a3d1c', nom: 'Cognac'},
  {c: '#9b1c1c', nom: 'Bordeaux'},
  {c: '#14532d', nom: 'Vert forêt'},
  {c: '#1e3a5f', nom: 'Bleu nuit'},
  {c: '#5b2a86', nom: 'Prune'},
  {c: '#f5efe4', nom: 'Crème'},
];
export const CARD_ACCENTS = [
  {c: '#d9b27a', nom: 'Or'},
  {c: '#f2c879', nom: 'Miel'},
  {c: '#ffd166', nom: 'Jaune'},
  {c: '#f4a3b5', nom: 'Rose'},
  {c: '#86efac', nom: 'Vert menthe'},
  {c: '#7dd3fc', nom: 'Bleu ciel'},
  {c: '#e9d5ff', nom: 'Lilas'},
  {c: '#121216', nom: 'Noir'},
];

// Configurateur (/creer-ma-carte/) : activités proposées, avec la récompense et les couleurs de départ de chacune.
// Le lien ?activite=… et le choix d'une activité dans la liste les appliquent, sauf ce que le visiteur a déjà
// modifié lui-même. Couleurs prises dans CARD_BGS / CARD_ACCENTS quand c'est possible (pastille enfoncée).
export const CARD_ACTIVITES: {nom: string; recompense: string; fond: string; tampons: string}[] = [
  {nom: 'Coiffure', recompense: 'Brushing offert', fond: '#1f1c17', tampons: '#d9b27a'},
  {nom: 'Barbier', recompense: 'Taille de barbe offerte', fond: '#121216', tampons: '#d9b27a'},
  {nom: 'Institut de beauté', recompense: 'Soin du visage offert', fond: '#5b2a86', tampons: '#f4a3b5'},
  {nom: 'Onglerie', recompense: 'Pose de vernis offerte', fond: '#121216', tampons: '#f4a3b5'}, // fond clair + rose : initiales illisibles
  {nom: 'Boulangerie', recompense: 'Viennoiserie offerte', fond: '#7a3d1c', tampons: '#f2c879'},
  {nom: 'Café', recompense: 'Café offert', fond: '#f5efe4', tampons: '#7a3d1c'},
  {nom: 'Restaurant', recompense: 'Dessert offert', fond: '#14532d', tampons: '#d9b27a'},
  {nom: 'Snack', recompense: 'Menu offert', fond: '#121216', tampons: '#ffd166'},
  {nom: 'Pizzeria', recompense: 'Pizza offerte', fond: '#9b1c1c', tampons: '#ffd166'},
  {nom: 'Sushi', recompense: 'Plateau offert', fond: '#121216', tampons: '#e63946'}, // secteur ciblé (2026-10-27)
  {nom: 'Fleuriste', recompense: 'Bouquet offert', fond: '#14532d', tampons: '#f4a3b5'},
  {nom: 'Boucherie', recompense: 'Brochettes offertes', fond: '#9b1c1c', tampons: '#d9b27a'},
  {nom: 'Pressing', recompense: 'Chemise nettoyée offerte', fond: '#1e3a5f', tampons: '#7dd3fc'},
  {nom: 'Boutique', recompense: '10 % sur le prochain achat', fond: '#121216', tampons: '#e9d5ff'},
  {nom: 'Autre', recompense: 'Cadeau offert', fond: '#1f1c17', tampons: '#d9b27a'},
];

// Activités sans place dans la liste du configurateur, mais reconnues dans les fiches des prospects (même liste que
// CORRESPONDANCE_SECTEUR dans _systeme/loyna_mail.py du coffre « Loyna Prospection ») : leur récompense.
export const ACTIVITES_EN_PLUS: {nom: string; recompense: string}[] = [
  {nom: 'Pâtisserie', recompense: 'Pâtisserie offerte'},
  {nom: 'Salon de thé', recompense: 'Boisson chaude offerte'},
  {nom: 'Bien-être', recompense: 'Massage offert'},
  {nom: 'Toiletteur', recompense: 'Toilettage offert'},
  {nom: 'Caviste', recompense: '10 % sur le prochain achat'},
  {nom: 'Fromagerie', recompense: '10 % sur le prochain achat'},
  {nom: 'Épicerie fine', recompense: '10 % sur le prochain achat'},
];

// Visuel personnalisé du mail perso après un appel (panel commercial, demande d'Ewan du 2026-10-27) : une ambiance
// par activité, seule source de ces couleurs (page /visuel-carte/, aperçu du panel, PNG du mail). `ambiance` et
// `ambiance2` : fond du visuel, en léger dégradé ; `texte` : couleur du texte posé dessus ; `fond` et `tampons` :
// couleurs de la carte. Contraste vérifié : le nom et l'activité de la carte restent lisibles (pas de rose sur fond
// clair rose, voir l'onglerie plus haut), les initiales prennent la couleur la plus lisible sur les tampons.
export interface Ambiance {
  ambiance: string;
  ambiance2: string;
  texte: string;
  fond: string;
  tampons: string;
}
export const CARD_AMBIANCES: Record<string, Ambiance> = {
  Onglerie: {ambiance: '#fbe4ec', ambiance2: '#f2bccf', texte: '#4a1830', fond: '#a8325f', tampons: '#ffd6e4'}, // tons roses
  Boulangerie: {ambiance: '#f5ead8', ambiance2: '#e3c9a1', texte: '#3d2814', fond: '#8a5a2e', tampons: '#f3d9a6'}, // beige, brun clair
  Barbier: {ambiance: '#17171b', ambiance2: '#2c261c', texte: '#f3e9d2', fond: '#0d0d10', tampons: '#d9b27a'}, // noir et or
  Coiffure: {ambiance: '#ebe3d8', ambiance2: '#cdbca6', texte: '#2f2820', fond: '#4a3f35', tampons: '#d9b27a'}, // taupe et or
  'Institut de beauté': {ambiance: '#f7e9e2', ambiance2: '#e9c9bf', texte: '#4a2c26', fond: '#94544c', tampons: '#f8d8cf'}, // nude, rose poudré
  Pâtisserie: {ambiance: '#f8f0e4', ambiance2: '#e7d3b9', texte: '#3b2416', fond: '#4a2c1d', tampons: '#f5e3c4'}, // crème et chocolat
  Snack: {ambiance: '#ffd84d', ambiance2: '#f4b400', texte: '#17140c', fond: '#121216', tampons: '#ffd166'}, // jaune et noir
  Pizzeria: {ambiance: '#c8352b', ambiance2: '#8c1d17', texte: '#fff4e2', fond: '#f8eedc', tampons: '#c8352b'}, // rouge tomate et crème
  Sushi: {ambiance: '#2b0b10', ambiance2: '#0c0c0f', texte: '#ffffff', fond: '#121216', tampons: '#e63946'}, // noir, rouge, touches de blanc
  Café: {ambiance: '#f4ece1', ambiance2: '#dcc8ad', texte: '#3a2618', fond: '#5a3a24', tampons: '#f3e3c7'}, // crème et brun
  'Salon de thé': {ambiance: '#f5eee4', ambiance2: '#e2cfb5', texte: '#3a2618', fond: '#6b3f2a', tampons: '#f1dfc4'}, // crème et brun
  Restaurant: {ambiance: '#163a2b', ambiance2: '#0b241a', texte: '#f3ead6', fond: '#0f2e22', tampons: '#d9b27a'}, // vert profond et or
  Fleuriste: {ambiance: '#e1e9da', ambiance2: '#b9caad', texte: '#23301f', fond: '#566f51', tampons: '#f7c6d3'}, // vert sauge et rose
  Boucherie: {ambiance: '#f4e9d7', ambiance2: '#e3cfb0', texte: '#3d1414', fond: '#8e1b1b', tampons: '#f3e3c3'}, // rouge et crème
  Pressing: {ambiance: '#e4eff9', ambiance2: '#b9d4ed', texte: '#0f2740', fond: '#1e3a5f', tampons: '#7dd3fc'}, // bleu
  Boutique: {ambiance: '#eee6f8', ambiance2: '#cdbbe8', texte: '#1d1626', fond: '#121216', tampons: '#e9d5ff'}, // noir et lilas
  'Bien-être': {ambiance: '#eee8f6', ambiance2: '#cfc2e6', texte: '#2a1f3d', fond: '#5b2a86', tampons: '#f4c7d4'}, // violet doux
  Toiletteur: {ambiance: '#e3f1ed', ambiance2: '#b9dad1', texte: '#12302b', fond: '#1e3a5f', tampons: '#86efac'}, // bleu nuit et menthe
  Caviste: {ambiance: '#3b0f17', ambiance2: '#1d070b', texte: '#f3e3cf', fond: '#6e1423', tampons: '#d9b27a'}, // bordeaux et or
  Fromagerie: {ambiance: '#f8eec9', ambiance2: '#ecd68e', texte: '#3a2a0c', fond: '#2f4a2b', tampons: '#f2d37a'}, // jaune paille et vert
  'Épicerie fine': {ambiance: '#efe8da', ambiance2: '#d6c6a5', texte: '#1f2b1e', fond: '#14532d', tampons: '#d9b27a'}, // vert forêt et or
  Autre: {ambiance: '#efeae2', ambiance2: '#d6ccbc', texte: '#1f1c17', fond: '#1f1c17', tampons: '#d9b27a'}, // neutre élégant
};

/** Activités proposées pour le visuel (configurateur, puis celles en plus), sans « Autre » en double. */
export const ACTIVITES_VISUEL: string[] = [...CARD_ACTIVITES.map((a) => a.nom).filter((n) => n !== 'Autre'), ...ACTIVITES_EN_PLUS.map((a) => a.nom), 'Autre'];

const simplifier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Activité reconnue (accents et majuscules ignorés), sinon « Autre » ; avec sa récompense et son ambiance. */
export function visuelActivite(nom: string): {nom: string; recompense: string} & Ambiance {
  const cle = simplifier(nom || '');
  const trouve = ACTIVITES_VISUEL.find((a) => simplifier(a) === cle) ?? 'Autre';
  const recompense = [...CARD_ACTIVITES, ...ACTIVITES_EN_PLUS].find((a) => a.nom === trouve)?.recompense ?? 'Cadeau offert';
  return {nom: trouve, recompense, ...CARD_AMBIANCES[trouve]};
}

// Version des CGV acceptée à l'essai (`cgv_version`) : même valeur dans supabase/functions/_shared/offer-terms.ts du
// dépôt LOYNA.
export const CGV_VERSION = '2026-11-04';

// SETUP_FEE et PARTENAIRES gardent leur nom et leur ordre : routes_ecrire.py (application locale du coffre « Loyna
// Prospection ») donne au chat qui rédige tout ce qui se trouve entre les deux, 9 000 caractères au plus.
export const SETUP_FEE = 49;

// QR code d'inscription personnalisé sous verre (option du 2026-10-26, dépôt LOYNA docs/OFFRES.md ; 17,99 € l'unité depuis
// le 2026-11-04) : achat unique, à l'unité ou en pack, sans TVA, livré sous 15 jours maximum à l'adresse de facturation.
// Proposé dans le panier (/panier/) et dans la Boutique de l'espace client ; produits Stripe loyna_qr_verre, loyna_qr_verre_5
// et loyna_qr_verre_10. Packs : -15 % par 5, -25 % par 10, arrondis au prix en 9 centimes au-dessus (packCents du dépôt LOYNA).
export const QR_VERRE = {
  unit: 17.99,
  pack5: 76.49, // -15 %
  pack10: 134.99, // -25 %
  maxUnit: 20,
  maxPack: 4,
  deliveryDays: 15,
};

// QR code avis Google sous verre (décision d'Ewan du 2026-11-04) : il ouvre la page d'avis Google du commerce. Vendu
// seulement dans la Boutique de l'espace client (fonction qr-order) ; produits Stripe loyna_qr_avis, _5 et _10.
export const QR_AVIS = {
  unit: 9.99,
  pack5: 42.49, // -15 %
  pack10: 74.99, // -25 %
  maxUnit: 20,
  maxPack: 4,
  deliveryDays: 15,
};

// Engagement (décision d'Ewan du 2026-10-31) : seulement proposé, réglé chaque mois, 15 % de moins.
export const ENGAGEMENT = {months: 12, discountPercent: 15};

// Essai depuis le site (même décision) : 1 mois de Starter, sur /essai/ (noindex). `open: false` : tous les boutons
// retombent sur « Choisir mon offre » et les textes sur l'essai sortent, cette constante suffit.
export const TRIAL = {open: true, label: '1 mois gratuit, sans carte bancaire'};
export const essaiUrl = '/essai/';

// Panier (décision d'Ewan du 2026-10-27) : les boutons « Choisir » y mènent ; le compte LOYNA y est créé avant le
// paiement. Les liens de paiement Stripe (`links` des offres) servent de secours au panier.
export const panierUrl = (plan: PlanId, e: Engagement) => `/panier/?offre=${plan}&engagement=${e === 'engage' ? 1 : 0}`;

// Offre de lancement (décision d'Ewan du 2026-10-09) : mise en service offerte pour tous jusqu'à cette date, avec un code
// promo Stripe (coupon loyna_lancement_2026_v2 : -49 € sur la 1re facture, valable sur les liens sans engagement).
// Ensuite : offerte avec engagement, SETUP_FEE une seule fois sans engagement, jamais refacturée à qui reprend un
// abonnement. Après la date, le site la masque tout seul (au build et dans le navigateur) et Stripe refuse le code.
export const LAUNCH_OFFER = {
  code: 'LANCEMENT2026',
  until: '2026-12-31T23:59:59+01:00',
  untilLabel: '31 décembre 2026',
};
export const offerActive = (now = new Date()) => now < new Date(LAUNCH_OFFER.until);

// Pour ne pas lasser les clients, quelle que soit l'offre : au plus un message commercial toutes les 24 h par client
// (délai réglable par le commerçant ; 24 h depuis la décision d'Ewan du 2026-10-30, 48 h avant). Les messages
// automatiques et la notification de proximité ne sont jamais décomptés.
export const MARKETING_INTERVAL_HOURS = 24;

// Offre retirée de la vente, jamais dans PLANS ni dans une liste de vente. Seul Barber Kong la garde, à son prix et pour la
// durée de son engagement : écran Abonnement (« offre historique »), droits de Pro en base sauf la carte sans mention.
export const LEGACY_PLANS = {premium: {name: 'Premium', monthly: 39.99}};

// Phrases fixes de la grille, au mot près partout : à reprendre d'ici. `essai` ne s'affiche que si TRIAL.open.
export const PHRASES = {
  starter: 'La carte complète, sans limite de clients, avec les messages qui partent tout seuls.',
  pro: 'Vos clients invitent leurs amis, LOYNA écrit vos messages.',
  pourquoiPro: 'Pour 20 € de plus par mois, 17 € avec engagement, vos clients invitent leurs amis et LOYNA écrit vos messages à votre place : vous n’avez plus qu’à valider.',
  prix: (p: Plan) => `${euro(p.monthly)} par mois, sans TVA, sans engagement : vous arrêtez à la fin de n’importe quel mois. Ou ${euro(p.engaged)} par mois avec ${ENGAGEMENT.months} mois d’engagement, réglés chaque mois.`,
  engagement: 'Avec 12 mois d’engagement : 15 % de moins, réglé chaque mois, rien d’avance. Sortie possible si votre commerce ferme, sur justificatif de radiation. Après les 12 mois : même prix, résiliable à la fin de n’importe quel mois, sans nouvelle durée.',
  essai: '1 mois gratuit, sans carte bancaire. Votre carte est créée tout de suite à partir de vos réglages et du modèle de votre métier. 1 essai par commerce.',
  arret: 'Si l’abonnement s’arrête ou si un paiement reste impayé 15 jours, la carte reste dans le téléphone de vos clients mais elle ne crédite plus, et les inscriptions et les messages s’arrêtent. Tout repart automatiquement dès que le paiement passe ou que l’abonnement est repris, avec vos clients et leurs soldes. Sans reprise, vos données sont supprimées 90 jours après l’arrêt.',
  miseEnService: 'Offerte jusqu’au 31 décembre 2026. Ensuite : offerte avec 12 mois d’engagement, 49 € une seule fois sans engagement.',
  parrainage: 'Parrainez un commerçant : 1 mois offert à chacun.',
  commission: '60 € en Starter, 100 € en Pro, avec ou sans engagement.',
};

// Repère à remplacer à l'étape 3 de la mise en ligne par les 4 URL de `stripe:catalog -- --apply --live` (dépôt LOYNA), puis
// à supprimer. Jusque-là, chaque lien mène au panier de la même offre. Jamais les 6 anciens liens : ancienne grille.

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    badge: 'La carte complète',
    tagline: PHRASES.starter,
    monthly: 29,
    engaged: 24.65,
    cards: null,
    campaignsPerWeek: 5,
    shops: 1,
    pitch: PHRASES.starter,
    focus: {
      title: 'Ça part tout seul',
      items: [
        'Notification à chaque passage et à chaque récompense',
        'Notification de proximité : votre carte s’affiche quand un client passe près de chez vous (1 adresse)',
        'Anniversaire, avec la surprise de votre choix (à activer en un réglage)',
        'Relance des clients qui ne reviennent plus',
        '« Plus qu’un passage ! »',
        'Demande d’avis Google après la 3e visite, réglable (à activer en un réglage)',
      ],
    },
    features: [
      'Clients et cartes illimités',
      'Carte Apple Wallet et Google Wallet à vos couleurs, avec votre logo (cachets à vos initiales d’office pour barbiers et coiffeurs)',
      'QR code d’inscription et affiche du comptoir à imprimer',
      'Passages, points ou montant dépensé, récompenses automatiques',
      'Scanner sur votre téléphone, comptes équipe illimités avec rôles',
      'Vos tampons papier repris sur la carte, client par client',
      '5 campagnes de notifications par semaine, à tous ou à un groupe de clients, tout de suite ou programmées',
      'Calendrier de 15 temps forts, message déjà écrit',
      'Tableau de bord et courbes jour par jour',
      'Rapport du mois par e-mail, avec jusqu’à 3 conseils',
      'Export de tous vos clients en CSV, à tout moment',
      'Support par e-mail et guide de démarrage',
    ],
    highlight: true,
    links: {sans: 'https://buy.stripe.com/4gMfZk2vE9whd012M05Ne0c', engage: 'https://buy.stripe.com/6oU00m1rA5g11hjdqE5Ne0d'},
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'LOYNA s’en occupe',
    tagline: PHRASES.pro,
    monthly: 49,
    engaged: 41.65,
    cards: null,
    campaignsPerWeek: null,
    shops: 3,
    pitch: PHRASES.pro,
    intro: 'Tout Starter, plus :',
    focus: {
      title: 'Vos clients invitent, LOYNA écrit',
      items: [
        'Parrainage entre vos clients : chacun invite ses amis avec son lien, bonus aux deux à la première visite',
        'LOYNA écrit et programme vos messages, au moins un par mois : vous validez, rien ne part sans vous',
        'Niveaux VIP bronze, argent et or : la carte de vos meilleurs clients change de couleur',
        'Votre carte finie à la main : logo retouché et, sur une carte à tampons, cachets à vos initiales (une fois, sous 15 jours)',
        'Votre carte sans la mention LOYNA',
        'Une vidéo et des visuels de votre carte, prêts à poster (une fois, sous 15 jours)',
        'Kit comptoir : 1 QR code sous verre par adresse, offert une fois',
        'Un point de 30 minutes par mois avec LOYNA, à votre demande',
      ],
    },
    features: [
      'Campagnes de notifications illimitées',
      'Jusqu’à 3 adresses avec la notification de proximité : une seule carte, un seul tableau de bord',
      'Support prioritaire',
    ],
    links: {sans: 'https://buy.stripe.com/00w6oKdai5g19NPeuI5Ne0e', engage: 'https://buy.stripe.com/14AbJ42vE4bX5xzeuI5Ne0f'},
  },
];

// Programme partenaires (apporteurs d'affaires, page /devenir-partenaire/), conditions de la grille du 2026-10-31 :
// commission unique par commerce, selon son offre, avec ou sans engagement : environ 2 mensualités, toujours moins que ce
// que le client a déjà payé quand elle devient due. Acquise au 3e paiement mensuel réellement encaissé.
// Virement sous 30 jours après la facture ou la note de commission ; recommandation confirmée sous 2 jours ouvrés et
// réservée 90 jours ; contrat résiliable avec 1 mois de préavis.
export const PARTENAIRES = {
  commission: {starter: 60, pro: 100},
  reserveJours: 90,
  confirmationJoursOuvres: 2,
  virementJours: 30,
  preavisMois: 1,
};

// Anciens liens et anciennes cartes préparées : ?offre=premium → starter, avec un avis (`legacy`) ; ?periode=annuel →
// engage ; ?periode=mensuel → sans. `engagement` l'emporte sur `periode` : '1' ou 'engage' (panierUrl, fiches des cartes),
// '0' ou 'sans'. Tout le reste : starter, sans engagement. Prend aussi le null de URLSearchParams.get().
export function normalizeOffer(offre?: string | null, periode?: string | null, engagement?: string | null): {plan: PlanId; engagement: Engagement; legacy: boolean} {
  const demande = offre?.trim().toLowerCase();
  const choix = engagement?.trim().toLowerCase();
  const engage = choix === '1' || choix === 'engage' || (choix !== '0' && choix !== 'sans' && periode?.trim().toLowerCase() === 'annuel');
  return {plan: demande === 'pro' ? 'pro' : 'starter', engagement: engage ? 'engage' : 'sans', legacy: demande === 'premium'};
}

// Appel principal de tout le site : l'essai, ou le choix d'une offre tant que l'essai est fermé (TRIAL.open).
export const APPEL = TRIAL.open ? {href: essaiUrl, label: 'Essayer 1 mois gratuitement'} : {href: '/tarifs/', label: 'Choisir mon offre'};

// Mise en service une fois l'offre de lancement finie, à la place de PHRASES.miseEnService (data-offer-off).
export const MISE_EN_SERVICE_APRES = 'Offerte avec 12 mois d’engagement, 49 € une seule fois sans engagement.';

// Nombre de commerces clients (décision du 2026-10-31). Le vrai chiffre et lui seul : les abonnements actifs de la table
// billing_subscriptions (dépôt LOYNA), à reporter ici à la main, jamais arrondi ni estimé (docs/BRIEF.md). Le bloc « Ils nous
// font confiance » de l'accueil (Confiance.astro) reste masqué sous le seuil et s'affiche seul, à la construction suivante,
// dès que le nombre l'atteint.
export const CLIENTS = {
  commerces: 1, // 1 abonnement actif à la lecture du 31/10/2026
  seuil: 10,
};
export const clientsAffiches = () => CLIENTS.commerces >= CLIENTS.seuil;

/** Nombre à la française, espace insécable entre les milliers : « 24 000 ». */
export const nombre = (n: number) => n.toLocaleString('fr-FR').replace(/[   ]/g, ' ');

/** « 5 campagnes par semaine », « Campagnes illimitées » (campagnes de notifications, quel que soit le nombre de clients). */
export function campagnesParSemaine(p: Plan): string {
  if (p.campaignsPerWeek === null) return 'Campagnes illimitées';
  return `${nombre(p.campaignsPerWeek)} campagne${p.campaignsPerWeek > 1 ? 's' : ''} par semaine`;
}

/** Quotas d'une offre en clair : « Cartes illimitées et 5 campagnes par semaine », « Cartes et campagnes illimitées ». */
export function quotas(p: Plan): string {
  if (p.campaignsPerWeek === null) return 'Cartes et campagnes illimitées';
  return `Cartes illimitées et ${campagnesParSemaine(p)}`;
}

const parOffre = <T,>(f: (p: Plan) => T) => PLANS.map(f) as [T, T];

// Tableau comparatif détaillé (✓ = inclus, chaîne = valeur), par groupes (titre sur la première ligne du groupe) ;
// `note` : condition à écrire à côté de la ligne.
export interface ComparisonRow {
  group?: string;
  label: string;
  values: [string | boolean, string | boolean];
  note?: string;
}
export const COMPARISON: ComparisonRow[] = [
  {group: 'Votre carte', label: 'Clients et cartes illimités', values: [true, true]},
  {label: 'Carte Apple Wallet et Google Wallet à vos couleurs, avec votre logo (cachets à vos initiales d’office pour barbiers et coiffeurs)', values: [true, true]},
  {label: 'QR code d’inscription et affiche du comptoir à imprimer', values: [true, true]},
  {label: 'Passages, points ou montant dépensé, récompenses automatiques', values: [true, true]},
  {label: 'Scanner sur votre téléphone, comptes équipe illimités avec rôles', values: [true, true]},
  {label: 'Vos tampons papier repris sur la carte, client par client', values: [true, true]},
  {group: 'Ça part tout seul', label: 'Notification à chaque passage et à chaque récompense', values: [true, true]},
  {
    label: 'Notification de proximité : votre carte s’affiche quand un client passe près de chez vous',
    values: parOffre((p) => `${nombre(p.shops)} adresse${p.shops > 1 ? 's' : ''}`),
    note: 'Avec 3 adresses : une seule carte, un seul tableau de bord.',
  },
  {label: 'Anniversaire, avec la surprise de votre choix', values: [true, true], note: 'À activer en un réglage, une fois la surprise choisie.'},
  {label: 'Relance des clients qui ne reviennent plus', values: [true, true]},
  {label: '« Plus qu’un passage ! »', values: [true, true]},
  {label: 'Demande d’avis Google après la 3e visite, réglable', values: [true, true], note: 'À activer en un réglage, avec votre lien d’avis.'},
  {
    group: 'Quand vous voulez leur écrire',
    label: 'Campagnes de notifications',
    values: parOffre((p) => (p.campaignsPerWeek === null ? 'Illimitées' : `${nombre(p.campaignsPerWeek)} par semaine`)),
    note: `Un même client reçoit au plus un message commercial par ${MARKETING_INTERVAL_HOURS} h, réglable.`,
  },
  {label: 'À tous ou à un groupe de clients', values: [true, true]},
  {label: 'Tout de suite ou programmées', values: [true, true]},
  {label: 'Calendrier de 15 temps forts, message déjà écrit', values: [true, true]},
  {group: 'Vous savez où vous en êtes', label: 'Tableau de bord et courbes jour par jour', values: [true, true]},
  {label: 'Rapport du mois par e-mail, avec jusqu’à 3 conseils', values: [true, true]},
  {label: 'Export de tous vos clients en CSV, à tout moment', values: [true, true]},
  {label: 'Support par e-mail et guide de démarrage', values: [true, 'Prioritaire'], note: 'Support prioritaire : traité avant les autres.'},
  {group: 'Vos clients invitent, LOYNA écrit', label: 'Parrainage entre vos clients : chacun invite ses amis avec son lien, bonus aux deux à la première visite', values: [false, true]},
  {label: 'LOYNA écrit et programme vos messages, au moins un par mois : vous validez, rien ne part sans vous', values: [false, true]},
  {label: 'Niveaux VIP bronze, argent et or : la carte de vos meilleurs clients change de couleur', values: [false, true], note: 'À activer en un réglage, comme le parrainage entre vos clients.'},
  {
    label: 'Votre carte finie à la main : logo retouché et, sur une carte à tampons, cachets à vos initiales',
    values: [false, 'Une fois, sous 15 jours'],
    note: TRIAL.open ? 'À partir du 1er paiement, jamais pendant l’essai.' : 'À partir du 1er paiement.',
  },
  {label: 'Votre carte sans la mention LOYNA', values: [false, true]},
  {
    label: 'Une vidéo et des visuels de votre carte, prêts à poster',
    values: [false, 'Une fois, sous 15 jours'],
    note: TRIAL.open ? 'À partir du 1er paiement, jamais pendant l’essai.' : 'À partir du 1er paiement.',
  },
  {
    label: 'Kit comptoir : 1 QR code sous verre par adresse',
    values: ['Option payante', 'Offert, une fois'],
    note: 'Avec engagement, envoyé après le 1er paiement ; sans engagement, après le 3e. Sous 15 jours ensuite.',
  },
  {label: 'Un point de 30 minutes par mois avec LOYNA, à votre demande', values: [false, true]},
];

export const NAV = [
  {href: '/fonctionnalites/', label: 'Fonctionnalités'},
  {href: '/tarifs/', label: 'Tarifs'},
  {href: '/secteurs/', label: 'Secteurs'},
  {href: '/creer-ma-carte/', label: 'Créer ma carte'},
  {href: '/blog/', label: 'Ressources'},
  {href: '/faq/', label: 'FAQ'},
];

export const euro = (n: number) =>
  n.toLocaleString('fr-FR', {minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2}).replace(/ /g, ' ') +
  ' €';
