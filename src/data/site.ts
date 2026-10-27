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
  ga4Id: '',
  // Référencement : codes de vérification (Search Console, Bing) et profils officiels de la marque.
  // Modifiables aussi dans Builder (site-settings : googleVerification, bingVerification, sameAs).
  googleVerification: '',
  bingVerification: '',
  sameAs: [] as string[],
  // Espace commerçant (LOYNA Business) : laissé vide tant que l'application n'est pas en ligne.
  appUrl: '',
  // Portail Stripe (abonnement, factures, moyen de paiement) : rempli après création du portail.
  billingPortalUrl: 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00',
};

// Offres Starter, Premium et Pro : source de vérité dans le dépôt LOYNA, docs/OFFRES.md (décision d'Ewan du
// 2026-10-25). Ne rien ajouter ici qui n'y figure pas.
export type PlanId = 'starter' | 'premium' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number; // € par mois (sans TVA : franchise en base, art. 293 B du CGI)
  yearly: number; // € par an (-15 %), sans TVA
  /** Cartes clients (clients inscrits au programme) ; null = illimitées. */
  cards: number | null;
  /** Notifications de campagne par mois (une notification = un message de campagne reçu par une carte) ; null = illimitées. */
  notifications: number | null;
  /** Boutiques (adresses), chacune avec la notification de proximité. */
  shops: number;
  pitch: string;
  intro?: string;
  /** Bloc mis en avant dans la grille tarifaire : automatisations (Premium), services de LOYNA (Pro). */
  focus?: {title: string; items: string[]};
  features: string[];
  highlight?: boolean;
  badge?: string;
  // Liens de paiement Stripe (mensuel avec mise en service, annuel sans) ; retour vers /merci/?offre=<id>-mensuel|annuel.
  // Depuis le 2026-10-27, on achète par le panier (/panier/) ; ces liens servent de secours au panier.
  links: {monthly: string; yearly: string};
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
  {nom: 'Fleuriste', recompense: 'Bouquet offert', fond: '#14532d', tampons: '#f4a3b5'},
  {nom: 'Boucherie', recompense: 'Brochettes offertes', fond: '#9b1c1c', tampons: '#d9b27a'},
  {nom: 'Pressing', recompense: 'Chemise nettoyée offerte', fond: '#1e3a5f', tampons: '#7dd3fc'},
  {nom: 'Boutique', recompense: '10 % sur le prochain achat', fond: '#121216', tampons: '#e9d5ff'},
  {nom: 'Autre', recompense: 'Cadeau offert', fond: '#1f1c17', tampons: '#d9b27a'},
];

export const SETUP_FEE = 49;

// QR code d'inscription personnalisé sous verre (option du 2026-10-26, dépôt LOYNA docs/OFFRES.md) : achat unique,
// à l'unité ou en pack, sans TVA, livré sous 15 jours maximum à l'adresse de facturation. Proposé dans le panier
// (/panier/) ; produits Stripe loyna_qr_verre, loyna_qr_verre_5 et loyna_qr_verre_10.
export const QR_VERRE = {
  unit: 9.99,
  pack5: 42.49, // -15 %
  pack10: 74.99, // -25 %
  maxUnit: 20,
  maxPack: 4,
  deliveryDays: 15,
};

// Panier (décision d'Ewan du 2026-10-27) : les boutons « Choisir » y mènent ; le compte LOYNA y est créé avant le
// paiement. Les liens de paiement Stripe (`links` des offres) servent de secours au panier.
export type Periode = 'mensuel' | 'annuel';
export const panierUrl = (plan: PlanId, periode: Periode) => `/panier/?offre=${plan}&periode=${periode}`;

// Offre de lancement (décision d'Ewan du 2026-10-09) : mise en service offerte en mensuel avec un code promo
// Stripe (coupon loyna_lancement_2026_v2 : -49 € sur la 1re facture, valable sur les liens mensuels).
// Après la date, le site la masque tout seul (au build et dans le navigateur) et Stripe refuse le code.
export const LAUNCH_OFFER = {
  code: 'LANCEMENT2026',
  until: '2026-12-31T23:59:59+01:00',
  untilLabel: '31 décembre 2026',
};
export const offerActive = (now = new Date()) => now < new Date(LAUNCH_OFFER.until);

// Pour ne pas lasser les clients, quelle que soit l'offre : au plus un message commercial toutes les 48 h par client
// (délai réglable par le commerçant). Les messages automatiques et la notification de proximité ne sont jamais décomptés.
export const MARKETING_INTERVAL_HOURS = 48;

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 29,
    yearly: 295.8,
    cards: 500,
    notifications: 2000,
    shops: 1,
    pitch: 'La carte de fidélité complète, à vos couleurs.',
    features: [
      'Carte Apple Wallet et Google Wallet à vos couleurs',
      'Notification de proximité',
      'Inscription par QR code, affiche du comptoir fournie',
      'Passages ou points, récompenses automatiques',
      'Scanner LOYNA Business et comptes équipe',
      'Notifications à chaque passage et à chaque récompense',
      'Campagnes de notifications à tous vos clients',
      'Tableau de bord',
      'Support par e-mail',
    ],
    links: {monthly: 'https://buy.stripe.com/00wdRcgmucItbVX5Yc5Ne06', yearly: 'https://buy.stripe.com/4gMbJ40nw6k5aRTdqE5Ne07'},
  },
  {
    id: 'premium',
    name: 'Premium',
    monthly: 39.99,
    yearly: 407.9,
    cards: 2000,
    notifications: 24000,
    shops: 1,
    pitch: 'Les automatisations qui font revenir vos clients.',
    intro: 'Tout Starter, plus :',
    focus: {
      title: 'Les automatisations',
      items: [
        'Anniversaire',
        'Relance des clients inactifs',
        '« Plus qu’un passage ! »',
        'Demande d’avis Google après la 3e visite',
        'Campagnes programmées',
        'Groupes de clients',
        'Rapport mensuel avec 3 conseils',
      ],
    },
    features: ['Statistiques avancées'],
    highlight: true,
    badge: 'Automatisations',
    links: {monthly: 'https://buy.stripe.com/dRm14q3zI23P5xzdqE5Ne08', yearly: 'https://buy.stripe.com/fZu8wSfiq6k5aRT86k5Ne09'},
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 89,
    yearly: 907.8,
    cards: null,
    notifications: null,
    shops: 3,
    pitch: 'LOYNA travaille avec vous.',
    intro: 'Tout Premium, plus :',
    focus: {
      title: 'LOYNA travaille avec vous',
      items: [
        'Suivi personnalisé : un point mensuel de 30 min',
        'Campagnes clés en main, validées en un clic',
        'Kit comptoir imprimé, envoyé à votre commerce',
        'Support prioritaire',
      ],
    },
    features: ['Jusqu’à 3 boutiques', 'Niveaux VIP bronze, argent et or', 'Parrainage entre vos clients'],
    badge: 'Le plus complet',
    links: {monthly: 'https://buy.stripe.com/00w28u2vEbEp1hjbiw5Ne0a', yearly: 'https://buy.stripe.com/28E28u8U27o99NP2M05Ne0b'},
  },
];

/** Nombre à la française, espace insécable entre les milliers : « 24 000 ». */
export const nombre = (n: number) => n.toLocaleString('fr-FR').replace(/[   ]/g, ' ');

/** Quotas d'une offre en clair : « 500 cartes et 2 000 notifications par mois », « Cartes et notifications illimitées ». */
export function quotas(p: Plan): string {
  if (p.cards === null && p.notifications === null) return 'Cartes et notifications illimitées';
  const cartes = p.cards === null ? 'cartes illimitées' : `${nombre(p.cards)} cartes`;
  const notifs = p.notifications === null ? 'notifications illimitées' : `${nombre(p.notifications)} notifications par mois`;
  return `${cartes} et ${notifs}`;
}

const parOffre = <T,>(f: (p: Plan) => T) => PLANS.map(f) as [T, T, T];

// Tableau comparatif détaillé (✓ = inclus, chaîne = valeur), par groupes (titre sur la première ligne du groupe)
export interface ComparisonRow {
  group?: string;
  label: string;
  values: [string | boolean, string | boolean, string | boolean];
}
export const COMPARISON: ComparisonRow[] = [
  {group: 'Cartes et notifications', label: 'Cartes clients', values: parOffre((p) => (p.cards === null ? 'Illimitées' : nombre(p.cards)))},
  {label: 'Notifications de campagne par mois', values: parOffre((p) => (p.notifications === null ? 'Illimitées' : nombre(p.notifications)))},
  {label: 'Boutiques (adresses)', values: parOffre((p) => (p.shops > 1 ? `Jusqu’à ${p.shops}` : String(p.shops)))},
  {group: 'La carte de fidélité', label: 'Carte Apple Wallet et Google Wallet à vos couleurs', values: [true, true, true]},
  {label: 'Notification de proximité', values: [true, true, true]},
  {label: 'Inscription par QR code, affiche du comptoir fournie', values: [true, true, true]},
  {label: 'Passages ou points, récompenses automatiques', values: [true, true, true]},
  {label: 'Scanner LOYNA Business et comptes équipe', values: [true, true, true]},
  {label: 'Notifications à chaque passage et à chaque récompense', values: [true, true, true]},
  {label: 'Campagnes de notifications à tous vos clients', values: [true, true, true]},
  {label: 'Tableau de bord', values: [true, true, true]},
  {group: 'Les automatisations', label: 'Anniversaire', values: [false, true, true]},
  {label: 'Relance des clients inactifs', values: [false, true, true]},
  {label: '« Plus qu’un passage ! »', values: [false, true, true]},
  {label: 'Demande d’avis Google après la 3e visite', values: [false, true, true]},
  {label: 'Campagnes programmées', values: [false, true, true]},
  {label: 'Groupes de clients', values: [false, true, true]},
  {label: 'Rapport mensuel avec 3 conseils', values: [false, true, true]},
  {label: 'Statistiques avancées', values: [false, true, true]},
  {group: 'LOYNA travaille avec vous', label: 'Suivi personnalisé : un point mensuel de 30 min', values: [false, false, true]},
  {label: 'Campagnes clés en main, validées en un clic', values: [false, false, true]},
  {label: 'Niveaux VIP bronze, argent et or', values: [false, false, true]},
  {label: 'Parrainage entre vos clients', values: [false, false, true]},
  {label: 'Kit comptoir imprimé', values: [false, false, true]},
  {label: 'Support', values: ['Par e-mail', 'Par e-mail', 'Prioritaire']},
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
