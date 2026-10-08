// Données centrales du site. Les textes modifiables par l'équipe viennent de Builder.io
// (voir src/lib/builder.ts) ; ce fichier donne les valeurs par défaut et tout ce qui est technique.

export const SITE = {
  name: 'LOYNA',
  url: 'https://loyna.fr',
  slogan: 'Faites revenir vos clients, sans complexité.',
  tagline: 'Loyal customers. Brighter tomorrows.',
  description:
    "LOYNA crée la carte de fidélité digitale de votre commerce dans Apple Wallet et Google Wallet, dès 29 € HT/mois : sans application, prête sous 24 h.",
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
  // Espace commerçant (LOYNA Business) : laissé vide tant que l'application n'est pas en ligne.
  appUrl: '',
  // Portail Stripe (abonnement, factures, moyen de paiement) : rempli après création du portail.
  billingPortalUrl: 'https://billing.stripe.com/p/login/28E28u2vEcIt4tvbiw5Ne00',
};

export type PlanId = 'essentiel' | 'growth' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  monthly: number; // € HT par mois
  yearly: number; // € HT par an (-15 %)
  pitch: string;
  intro?: string;
  features: string[];
  highlight?: boolean;
  badge?: string;
  // Liens de paiement Stripe (mensuel avec mise en service, annuel sans)
  links: {monthly: string; yearly: string};
}

export const SETUP_FEE = 49;

// Offre de lancement (décision d'Ewan du 2026-10-09) : mise en service offerte en mensuel avec un code promo
// Stripe (coupon loyna_lancement_2026_v2 : -49 € sur la 1re facture, valable sur les liens mensuels).
// Après la date, le site la masque tout seul (au build et dans le navigateur) et Stripe refuse le code.
export const LAUNCH_OFFER = {
  code: 'LANCEMENT2026',
  until: '2026-12-31T23:59:59+01:00',
  untilLabel: '31 décembre 2026',
};
export const offerActive = (now = new Date()) => now < new Date(LAUNCH_OFFER.until);

export const PLANS: Plan[] = [
  {
    id: 'essentiel',
    name: 'Essentiel',
    monthly: 29,
    yearly: 295.8,
    pitch: 'Votre carte de fidélité Wallet, complète et automatique.',
    features: [
      'Carte Apple Wallet et Google Wallet',
      'Notifications Wallet',
      "QR code d'inscription",
      'Points ou passages',
      'Récompenses automatiques',
      'Scanner (validation en un scan)',
      'Tableau de bord',
    ],
    links: {monthly: 'https://buy.stripe.com/28E28u2vEcIt4tvbiw5Ne00', yearly: 'https://buy.stripe.com/6oU00meem6k5bVX5Yc5Ne03'},
  },
  {
    id: 'growth',
    name: 'Growth',
    monthly: 49,
    yearly: 499.8,
    pitch: 'Pour relancer vos clients au bon moment.',
    intro: 'Tout Essentiel, plus :',
    features: [
      '200 SMS par mois',
      'Segmentation des clients',
      'Anniversaires',
      'Relance des clients inactifs',
      'Campagnes Wallet programmées',
      'Statistiques avancées',
    ],
    highlight: true,
    badge: 'SMS inclus',
    links: {monthly: 'https://buy.stripe.com/9B64gC7PY6k59NPaes5Ne01', yearly: 'https://buy.stripe.com/3cI28u8U237T4tv9ao5Ne04'},
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 79,
    yearly: 805.8,
    pitch: 'Pour automatiser et connecter vos outils.',
    intro: 'Tout Growth, plus :',
    features: [
      '500 SMS par mois',
      'Intégrations compatibles',
      'Automatisations avancées',
      'API et webhooks',
      'Support prioritaire',
    ],
    badge: 'Le plus complet',
    links: {monthly: 'https://buy.stripe.com/eVq7sO2vE6k52ln1HW5Ne02', yearly: 'https://buy.stripe.com/14AeVgb2a37T9NPaes5Ne05'},
  },
];

// Tableau comparatif détaillé (✓ = inclus, chaîne = valeur)
export const COMPARISON: Array<{label: string; values: [string | boolean, string | boolean, string | boolean]}> = [
  {label: 'Carte Apple Wallet et Google Wallet', values: [true, true, true]},
  {label: 'Personnalisation (logo, couleurs, récompense)', values: [true, true, true]},
  {label: "QR code d'inscription", values: [true, true, true]},
  {label: 'Points ou passages', values: [true, true, true]},
  {label: 'Récompenses automatiques', values: [true, true, true]},
  {label: 'Scanner LOYNA Business', values: [true, true, true]},
  {label: 'Notifications Wallet', values: [true, true, true]},
  {label: 'Tableau de bord', values: [true, true, true]},
  {label: 'Comptes équipe (rôles et droits)', values: [true, true, true]},
  {label: 'SMS inclus chaque mois', values: [false, '200', '500']},
  {label: 'Segmentation des clients', values: [false, true, true]},
  {label: 'Anniversaires automatiques', values: [false, true, true]},
  {label: 'Relance des clients inactifs', values: [false, true, true]},
  {label: 'Campagnes Wallet programmées', values: [false, true, true]},
  {label: 'Statistiques avancées', values: [false, true, true]},
  {label: 'Intégrations compatibles', values: [false, false, true]},
  {label: 'Automatisations avancées', values: [false, false, true]},
  {label: 'API et webhooks', values: [false, false, true]},
  {label: 'Support prioritaire', values: [false, false, true]},
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
