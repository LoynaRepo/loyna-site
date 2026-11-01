// Démonstration de LOYNA Business (loyna.fr/espace-client/demo/, et ?demo en développement) :
// un commerce fictif tiré au hasard, avec clients, passages, récompenses, campagnes, automatisations,
// boutiques et équipe générés à partir d'une « graine ». Tout reste en mémoire dans le navigateur :
// aucune requête réseau (même la recherche d'adresse est simulée), rien n'est enregistré. Les numéros de
// téléphone utilisent la tranche 06 39 98 réservée par l'ARCEP à la fiction, les e-mails le domaine
// réservé example.com. L'offre affichée est Pro (tout est visible) ; ?offre=starter|pro la change, ?offre=premium montre
// l'écran de Barber Kong en développement seulement. États du service, pour les captures et les contrôles : ?essai=1,
// ?arret=essai|paiement|fin|manuel, ?sursis=1 (bandeaux de la section 2.2 du cahier des charges de la grille) ; en plus,
// ?engage=1 (engagement en cours), ?engage=fini (engagement terminé), ?exempte=1 (compte offert).
import {PLANS as VENTE} from '../data/site';
import {ApiError} from './http';
import type {Backend, GeoResult, Match, SelectOptions} from './backend';
import {campaignName, sendAt, tempsForts} from './temps-forts';

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString();
const SEED_KEY = 'loyna-demo-seed';

/** Graine de la démonstration : ?seed=…, sinon celle déjà utilisée dans ce navigateur, sinon une nouvelle. */
export function demoSeed(): number {
  const fromUrl = Number(new URLSearchParams(location.search).get('seed'));
  let seed = Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : 0;
  if (!seed) {
    try {
      seed = Number(localStorage.getItem(SEED_KEY)) || 0;
    } catch {
      /* stockage indisponible */
    }
  }
  if (!seed) seed = 100000 + Math.floor(Math.random() * 899999);
  try {
    localStorage.setItem(SEED_KEY, String(seed));
  } catch {
    /* stockage indisponible */
  }
  return seed;
}
/** Nouvelles données : nouvelle graine, puis rechargement de la page. */
export function regenerateDemo() {
  const seed = 100000 + Math.floor(Math.random() * 899999);
  try {
    localStorage.setItem(SEED_KEY, String(seed));
  } catch {
    /* stockage indisponible */
  }
  // la graine dans l'adresse force un vrai rechargement (un simple changement d'ancre n'en fait pas)
  const u = new URL(location.href);
  u.searchParams.set('seed', String(seed));
  u.hash = '#/accueil';
  location.assign(u.toString());
}

// --- Offre affichée : Pro par défaut (toutes les fonctions visibles), ?offre=… pour montrer l'autre ---------
export type Plan = 'STARTER' | 'PREMIUM' | 'PRO';
const PLANS: Plan[] = ['STARTER', 'PREMIUM', 'PRO'];
export function demoPlan(): Plan {
  const q = new URLSearchParams(location.search);
  const p = (q.get('offre') ?? '').toUpperCase();
  if (q.get('essai') === '1' || q.get('arret') === 'essai') return 'STARTER'; // l'essai donne Starter, quelle que soit l'offre demandée
  // Premium n'est plus vendue : un ancien lien public montre Starter, sans la citer
  if (p === 'PREMIUM') return import.meta.env.DEV ? 'PREMIUM' : 'STARTER';
  return PLANS.find((x) => x === p) ?? 'PRO';
}

// --- État du service montré : mêmes valeurs que la RPC my_service_state --------------------------------------
export type DemoMode = 'ACTIVE' | 'TRIAL' | 'GRACE' | 'STOP_TRIAL' | 'STOP_PAY' | 'STOP_END' | 'MANUAL' | 'EXEMPT';
export function demoMode(): DemoMode {
  const q = new URLSearchParams(location.search);
  const arret = q.get('arret');
  if (arret === 'essai') return 'STOP_TRIAL';
  if (arret === 'paiement') return 'STOP_PAY';
  if (arret === 'fin') return 'STOP_END';
  if (arret === 'manuel') return 'MANUAL';
  if (q.get('essai') === '1') return 'TRIAL';
  if (q.get('sursis') === '1') return 'GRACE';
  if (q.get('exempte') === '1') return 'EXEMPT';
  return 'ACTIVE';
}
/** Même commerce, autre offre : rechargement avec ?offre=… (la graine est gardée ; en Pro s'ajoutent deux amis parrainés pas encore venus). */
export function setDemoPlan(plan: Plan, seed: number) {
  const u = new URL(location.href);
  u.searchParams.set('offre', plan.toLowerCase());
  u.searchParams.set('seed', String(seed));
  location.assign(u.toString());
}

// --- Hasard reproductible -----------------------------------------------------------------------------
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Référentiels : même matrice que le serveur (plan_entitlements, section 1.4 du cahier des charges de la grille) ---
// PREMIUM : droits de Pro, sauf la carte sans mention LOYNA (Barber Kong, sa carte validée ne change pas).
const STARTER_FEATURES = ['wallet.apple', 'wallet.google', 'wallet.notifications', 'wallet.proximity', 'enrollment.qr', 'loyalty.visits', 'loyalty.points', 'loyalty.spend', 'rewards', 'scanner', 'dashboard', 'campaigns.wallet', 'segmentation', 'campaigns.scheduled', 'automation.birthday', 'automation.inactive', 'automation.near_reward', 'automation.review', 'analytics.advanced', 'reports.monthly', 'cards.max', 'campaigns.weekly_quota', 'locations.max'];
const PRO_FEATURES = ['loyalty.tiers', 'referral', 'campaigns.prepared', 'support.followup', 'support.priority'];
const PLAN_FEATURES: Record<Plan, string[]> = {
  STARTER: STARTER_FEATURES,
  PREMIUM: [...STARTER_FEATURES, ...PRO_FEATURES],
  PRO: [...STARTER_FEATURES, ...PRO_FEATURES, 'card.no_loyna_mention'],
};
// Limites (null = illimité) : cartes, campagnes par semaine, boutiques
const LIMITS: Record<string, Record<Plan, number | null>> = {
  'cards.max': {STARTER: null, PREMIUM: null, PRO: null},
  'campaigns.weekly_quota': {STARTER: 5, PREMIUM: null, PRO: null},
  'locations.max': {STARTER: 1, PREMIUM: 3, PRO: 3},
};

const FEATURES_CATALOG: [string, string][] = [
  ['wallet.apple', 'Carte Apple Wallet'], ['wallet.google', 'Carte Google Wallet'], ['wallet.notifications', 'Notifications Wallet'], ['wallet.proximity', 'Notification de proximité (carte affichée près de la boutique)'],
  ['enrollment.qr', 'Inscription par QR code'], ['loyalty.visits', 'Programme au passage'], ['loyalty.points', 'Programme à points'], ['loyalty.spend', 'Programme au montant dépensé'], ['rewards', 'Récompenses'],
  ['scanner', 'Scanner LOYNA Business'], ['dashboard', 'Tableau de bord'], ['campaigns.wallet', 'Campagnes par notification Wallet'], ['cards.max', 'Cartes clients incluses (clients inscrits, hors supprimés)'],
  ['campaigns.weekly_quota', 'Campagnes de notifications par semaine, quel que soit le nombre de destinataires (le compteur repart chaque lundi)'],
  ['locations.max', 'Boutiques (adresses de la notification de proximité)'], ['segmentation', 'Segmentation des campagnes'],
  ['automation.birthday', 'Automatisation anniversaires'], ['automation.inactive', 'Relance des clients inactifs'], ['automation.near_reward', 'Rappel « Plus qu’un passage ! »'], ['automation.review', 'Demande d’avis Google après la Ne visite'],
  ['campaigns.scheduled', 'Campagnes programmées'], ['analytics.advanced', 'Statistiques avancées'], ['reports.monthly', 'Rapport mensuel de statistiques avec conseils'],
  ['loyalty.tiers', 'Niveaux VIP (bronze, argent, or)'], ['referral', 'Parrainage entre clients'], ['campaigns.prepared', 'Campagnes clés en main préparées par LOYNA'], ['support.followup', 'Suivi personnalisé mensuel'],
  ['support.priority', 'Support prioritaire'], ['card.no_loyna_mention', 'Carte sans la mention LOYNA'],
];
const PERMS: [string, string][] = [
  ['scan.validate', 'Scanner une carte et valider un passage'], ['scan.override_cooldown', 'Forcer un passage malgré le délai anti-double scan'],
  ['scan.custom_points', 'Saisir un nombre de points personnalisé'], ['transactions.reverse_own', 'Annuler son propre passage récent'],
  ['transactions.reverse_any', 'Annuler n’importe quel passage'], ['transactions.adjust', 'Ajuster manuellement un solde'],
  ['rewards.redeem', 'Valider l’utilisation d’une récompense'], ['customers.read_basic', 'Voir prénom, solde et récompenses des clients'],
  ['customers.read', 'Voir la fiche client complète (coordonnées)'], ['customers.manage', 'Modifier, exporter ou supprimer un client'],
  ['program.manage', 'Modifier le programme de fidélité'], ['rewards.manage', 'Gérer les récompenses'], ['campaigns.manage', 'Préparer des campagnes'],
  ['campaigns.send', 'Envoyer ou programmer des campagnes'], ['team.manage', 'Gérer l’équipe'], ['settings.manage', 'Modifier la configuration et le branding'],
  ['analytics.read', 'Consulter les statistiques'], ['audit.read', 'Consulter le journal d’audit'], ['wallet.reissue', 'Renvoyer le lien d’ajout de la carte Wallet'],
];
const STAFF_PERMS = ['scan.validate', 'transactions.reverse_own', 'rewards.redeem', 'customers.read_basic', 'wallet.reissue'];

interface Template {
  type: string;
  names: string[];
  threshold: number;
  rewards: [number, string, 'FREE_ITEM' | 'DISCOUNT_PERCENT', number?][];
  closed: number[]; // jours de fermeture (0 = dimanche)
  pace: number; // passages par mois d'un client régulier
  messages: string[];
  perks: [string, string, string]; // avantages Bronze, Argent, Or
  proximity: string; // message de proximité (90 caractères au plus)
}
const TEMPLATES: Template[] = [
  {type: 'Coiffure', names: ['Maison Lumière', 'Salon Céleste', 'L’Atelier des Mèches'], threshold: 10, rewards: [[10, 'Brushing offert', 'FREE_ITEM'], [5, '-10 % sur les soins', 'DISCOUNT_PERCENT', 10]], closed: [0, 1], pace: 1, messages: ['{prenom}, nos soins d’automne arrivent : -15 % toute la semaine chez {commerce}.', 'Envie de changement, {prenom} ? Nouvelles couleurs disponibles chez {commerce}.'], perks: ['-5 % sur les produits', '-10 % sur les produits', 'Un soin offert une fois par mois'], proximity: 'Envie d’un brushing ? Votre carte est prête.'},
  {type: 'Boulangerie', names: ['Boulangerie du Moulin Doré', 'Le Fournil Ambré'], threshold: 10, rewards: [[10, 'Viennoiserie offerte', 'FREE_ITEM']], closed: [1], pace: 6, messages: ['{prenom}, la galette maison est de retour chez {commerce} !', 'Nouveau : pain aux noix tous les vendredis chez {commerce}.'], perks: ['Une chouquette offerte le samedi', 'Une baguette offerte par semaine', 'Un gâteau offert pour votre anniversaire'], proximity: 'Le pain sort du four : votre carte est prête !'},
  {type: 'Café', names: ['Café Comptoir Ambre', 'Le Petit Torréfacteur'], threshold: 8, rewards: [[8, 'Café offert', 'FREE_ITEM']], closed: [0], pace: 5, messages: ['{prenom}, notre nouveau café de saison vous attend chez {commerce}.', 'Happy hour : -20 % sur les boissons de 15 h à 17 h chez {commerce}.'], perks: ['Un cookie offert avec votre café', 'La boisson du mois à moitié prix', 'Un café offert chaque semaine'], proximity: 'Une pause café ? Votre carte est prête.'},
  {type: 'Pizzeria', names: ['Pizzeria Nonna Luce', 'La Pizza du Four Doré'], threshold: 10, rewards: [[10, 'Pizza offerte', 'FREE_ITEM'], [5, 'Boisson offerte', 'FREE_ITEM']], closed: [1], pace: 2, messages: ['{prenom}, la pizza du mois est arrivée chez {commerce} !', 'Ce soir, dessert offert pour toute pizza achetée chez {commerce}.'], perks: ['Une boisson offerte', 'Un dessert offert', 'Une pizza offerte par mois'], proximity: 'Une petite faim ? Votre carte est prête.'},
  {type: 'Institut de beauté', names: ['Institut Sérénité', 'L’Instant Ambre'], threshold: 8, rewards: [[8, 'Soin visage offert', 'FREE_ITEM'], [4, '-15 % sur un soin', 'DISCOUNT_PERCENT', 15]], closed: [0, 1], pace: 1, messages: ['{prenom}, offrez-vous une pause : -15 % sur les soins du corps chez {commerce}.'], perks: ['-5 % sur les produits', '-10 % sur les produits', 'Un soin offert chaque trimestre'], proximity: 'Un moment pour vous ? Votre carte est prête.'},
  {type: 'Fleuriste', names: ['Atelier Pétales', 'Fleurs de Saison'], threshold: 10, rewards: [[10, 'Bouquet offert', 'FREE_ITEM']], closed: [1], pace: 1.5, messages: ['{prenom}, les premières pivoines sont arrivées chez {commerce}.'], perks: ['Un emballage cadeau offert', '-10 % sur les bouquets', 'Un bouquet offert par mois'], proximity: 'Un bouquet pour égayer la journée ? Votre carte est prête.'},
  {type: 'Barbier', names: ['Le Rasoir d’Or', 'Le Comptoir du Barbier'], threshold: 8, rewards: [[8, 'Coupe offerte', 'FREE_ITEM']], closed: [0, 1], pace: 1.2, messages: ['{prenom}, un créneau vous attend cette semaine chez {commerce}.'], perks: ['Un soin de barbe offert', '-10 % sur les produits', 'Une coupe offerte par trimestre'], proximity: 'Un coup de frais ? Votre carte est prête.'},
];
const COLORS: [string, string][] = [
  ['#1f1c17', '#f8f4ec'], ['#121216', '#e6c27a'], ['#7a3d1c', '#f8f4ec'], ['#9b1c1c', '#f8f4ec'], ['#14532d', '#f8f4ec'], ['#1e3a5f', '#f8f4ec'], ['#5b2a86', '#f8f4ec'], ['#f5efe4', '#1f1c17'],
];
const FIRST = ['Léa', 'Hugo', 'Chloé', 'Lucas', 'Manon', 'Nathan', 'Inès', 'Théo', 'Camille', 'Louis', 'Jade', 'Arthur', 'Zoé', 'Jules', 'Emma', 'Gabriel', 'Sarah', 'Adam', 'Lina', 'Raphaël', 'Alice', 'Noah', 'Rose', 'Tom', 'Anna', 'Paul', 'Juliette', 'Maël', 'Louise', 'Sacha', 'Ambre', 'Nolan', 'Clara', 'Ethan', 'Mila', 'Victor', 'Eva', 'Martin', 'Nina', 'Simon'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier'];
const STAFF_NAMES = ['Yanis', 'Sofia', 'Mehdi', 'Clémence', 'Lou', 'Karim', 'Océane', 'Bastien'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // comme le serveur : sans 0/O ni 1/I
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const TIER_NAMES = ['', 'Bronze', 'Argent', 'Or'];
// Centre de Montpellier : les boutiques fictives sont placées autour
const CENTER = {lat: 43.6108, lon: 3.8767};

// --- Génération ---------------------------------------------------------------------------------------
export interface DemoMerchant {
  seed: number;
  plan: Plan;
  merchant: {id: string; name: string; slug: string; business_type: string; logo_url: string | null; primary_color: string; secondary_color: string; address: string; postal_code: string; city: string; phone: string; website: string | null; latitude: number; longitude: number; timezone: string};
  program: any;
  rewards: any[];
  owner: string;
  tpl: Template;
}

/** Commerce, programme et récompenses d'une graine (aussi utilisé par la page d'inscription de démonstration). */
export function demoMerchant(seed: number, plan: Plan = 'PRO'): DemoMerchant {
  const r = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const tpl = pick(TEMPLATES);
  const [bg, fg] = pick(COLORS);
  r(); // ancien tirage de l'offre : gardé pour que chaque graine donne toujours le même commerce
  const name = pick(tpl.names);
  const program = {
    id: 'demo-prog', merchant_id: 'demo-merchant', name: `Carte fidélité ${name}`, type: 'VISITS', points_per_event: 1, spend_points_per_unit: null, spend_rounding: 'FLOOR',
    reward_threshold: tpl.threshold, reset_behavior: 'RESET_ON_REWARD', scan_cooldown_minutes: 60, unit_label_singular: 'passage', unit_label_plural: 'passages',
    wallet_description: `Un tampon à chaque visite : ${tpl.rewards[0][1].toLowerCase()} au ${tpl.threshold}e passage.`, status: 'ACTIVE', created_at: iso(Date.now() - 200 * DAY),
  };
  const rewards = tpl.rewards.map(([threshold, rname, type, value], i) => ({
    id: `demo-rw${i}`, merchant_id: 'demo-merchant', program_id: 'demo-prog', name: rname, description: null, threshold, reward_type: type, value: value ?? null,
    validity_days: i === 0 ? 90 : null, status: 'ACTIVE', sort_order: i,
  }));
  const owner = pick(['Camille', 'Julien', 'Sophie', 'Karim', 'Élodie', 'Thomas', 'Nadia', 'Antoine']);
  const street = 1 + Math.floor(r() * 80);
  const phone = `04 99 ${String(10 + Math.floor(r() * 89))} 00 00`;
  return {
    seed,
    plan,
    tpl,
    owner,
    merchant: {
      // ?slug= : essais locaux seulement (prix réservé de l'écran Abonnement, tools/qa-app.mjs)
      id: 'demo-merchant', name, slug: (import.meta.env.DEV && new URLSearchParams(location.search).get('slug')) || `demo-${seed}`, business_type: tpl.type, logo_url: null, primary_color: bg, secondary_color: fg,
      address: `${street} rue de l’Exemple`, postal_code: '34000', city: 'Montpellier', phone, website: null,
      latitude: round6(CENTER.lat + (r() - 0.5) * 0.012), longitude: round6(CENTER.lon + (r() - 0.5) * 0.016), timezone: 'Europe/Paris',
    },
    program,
    rewards,
  };
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

interface Tx {
  id: string;
  seq: number;
  type: 'EARN' | 'REDEEM' | 'REVERSAL' | 'ADJUSTMENT';
  source: string;
  points_delta: number;
  balance_after: number;
  amount: number | null;
  note: string | null;
  created_at: string;
  staff_name: string | null;
  reversed: boolean;
}
interface CReward {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'REDEEMED';
  earned_at: string;
  redeemed_at: string | null;
}
interface Cust {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  created_at: string;
  last: string;
  balance: number;
  visits: number;
  rewards: CReward[];
  tx: Tx[];
  consents: {marketing_wallet: boolean};
  apple: boolean;
  deleted?: boolean;
  referral_code: string;
  referred_by: string | null;
  referral_rewarded_at: string | null;
}

/** Identité imposée au commerce fictif (consultation d'un commerce de l'écran Opérateur, développement seulement). */
interface Identity {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
}

export function createMockBackend(seed: number, plan: Plan = demoPlan(), as?: Identity, mode: DemoMode = demoMode()): Backend {
  const d = demoMerchant(seed, plan);
  if (as) {
    Object.assign(d.merchant, as);
    d.program.merchant_id = as.id;
    d.program.name = `Carte fidélité ${as.name}`;
    for (const rw of d.rewards) rw.merchant_id = as.id;
  }
  const r = mulberry32(seed * 7 + 13);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const now = Date.now();
  let uid = 0;
  const id = () => `d${seed}-${++uid}`;
  const features = () => PLAN_FEATURES[d.plan]; // l'offre change avec « Changer d'offre » (subscription-change)
  const has = (f: string) => features().includes(f);
  const limit = (f: string) => LIMITS[f]?.[d.plan] ?? null;
  const params = new URLSearchParams(as ? '' : location.search);
  // Engagement : Barber Kong (?offre=premium) a le sien jusqu'au 27/10/2027 ; sinon ?engage=1, ou ?engage=fini s'il est terminé
  let commitmentEnd: string | null = d.plan === 'PREMIUM' ? '2027-10-27T12:00:00.000Z' : params.get('engage') === '1' ? iso(now + 214 * DAY) : params.get('engage') === 'fini' ? iso(now - 20 * DAY) : null;
  const engaged = () => !!commitmentEnd && new Date(commitmentEnd).getTime() > Date.now();
  const paused = () => mode === 'STOP_TRIAL' || mode === 'STOP_PAY' || mode === 'STOP_END' || mode === 'MANUAL';
  const hasSubscription = () => mode !== 'TRIAL' && mode !== 'STOP_TRIAL' && mode !== 'EXEMPT';
  const stoppedAt = now - 4 * DAY;
  const PAUSED_DISPLAY = {tone: 'error', title: 'Programme en pause', subtitle: 'Ce passage n’est pas crédité : voir Abonnement.', lines: [], vibrate: [200], actions: []};
  const FAKE_INVOICE = 'https://loyna.fr/espace-client/demo/#facture-fictive';
  /** Mêmes champs que la RPC my_service_state. */
  function serviceState() {
    const base = {
      plan: d.plan, trial_ends_at: null as string | null, trial_days_left: null as number | null, stop_reason: null as string | null, stopped_at: null as string | null, stop_at: null as string | null,
      pay_url: null as string | null, data_delete_after: null as string | null, engaged: engaged(), commitment_end: engaged() ? commitmentEnd : null, can_change: false,
    };
    const stop = (stop_reason: string, pay_url: string | null = null) => ({...base, state: 'STOPPED', stop_reason, stopped_at: iso(stoppedAt), data_delete_after: iso(stoppedAt + 90 * DAY), pay_url});
    switch (mode) {
      case 'TRIAL':
        return {...base, state: 'TRIAL', trial_ends_at: iso(now + 23 * DAY), trial_days_left: 23};
      case 'GRACE':
        return {...base, state: 'GRACE', stop_at: iso(now + 9 * DAY), pay_url: FAKE_INVOICE};
      case 'STOP_TRIAL':
        return stop('TRIAL_ENDED');
      case 'STOP_PAY':
        return stop('PAYMENT_FAILED', FAKE_INVOICE);
      case 'STOP_END':
        return stop('SUBSCRIPTION_ENDED');
      case 'MANUAL':
        return {...base, state: 'SUSPENDED_MANUAL', stop_reason: 'OPERATOR', stopped_at: iso(stoppedAt)};
      case 'EXEMPT':
        return {...base, state: 'EXEMPT'};
      default:
        return {...base, state: 'ACTIVE', can_change: d.plan !== 'PREMIUM' && !(engaged() && d.plan === 'PRO')};
    }
  }
  // Essais locaux des jauges (développement seulement) : ?usage=85 affiche 85 % des campagnes de la semaine consommées
  const usagePct = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('usage')) || 0 : 0;
  // Essais locaux de l'écran « Votre commande » d'un compte sans commerce (développement seulement) :
  // ?demo&commande (une commande Pro avec QR codes), ?demo&commande=0 (aucune commande)
  const orderDemo = import.meta.env.DEV ? new URLSearchParams(location.search).get('commande') : null;
  // Essais locaux de l'écran Opérateur (développement seulement, module mock-operateur.ts) : ?demo&operateur (opérateur
  // membre du commerce fictif), ?demo&operateur=seul (opérateur sans commerce). Jamais dans la démonstration publique.
  const operatorDemo = import.meta.env.DEV ? new URLSearchParams(location.search).get('operateur') : null;
  const operatorSelf = () => ({
    id: d.merchant.id, name: db.merchants[0].name, slug: d.merchant.slug, plan: d.plan, primary_color: db.merchants[0].primary_color,
    secondary_color: db.merchants[0].secondary_color, cards: customers.filter((c) => !c.deleted).length, owner_email: staff[0].email, member: operatorDemo !== 'seul',
  });

  // Équipe (les tirages ne dépendent pas de l'offre : même commerce quelle que soit l'offre affichée)
  const others = [...STAFF_NAMES].sort(() => r() - 0.5).slice(0, int(1, 3));
  const staff = [
    {id: 'st-owner', merchant_id: d.merchant.id, user_id: 'u-owner', role: 'OWNER', status: 'ACTIVE', display_name: d.owner, email: `${d.owner.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`, permissions: {}, last_seen_at: iso(now - 60000), created_at: iso(now - 200 * DAY)},
    ...others.map((n, i) => ({
      id: `st-${i}`, merchant_id: d.merchant.id, user_id: `u-${i}`, role: i === 0 && r() < 0.4 && d.plan !== 'STARTER' ? 'ADMIN' : 'STAFF',
      status: i === others.length - 1 && r() < 0.35 ? 'INVITED' : 'ACTIVE', display_name: n, email: `${n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`,
      permissions: {}, last_seen_at: iso(now - int(1, 72) * 3600000), created_at: iso(now - int(10, 150) * DAY),
    })),
  ];
  const scanners = staff.filter((s) => s.status === 'ACTIVE').map((s) => s.display_name);

  // Clients et passages : profils réguliers, occasionnels, perdus de vue
  const threshold = d.program.reward_threshold;
  const openDay = (t: number) => {
    let x = t;
    for (let k = 0; k < 7 && d.tpl.closed.includes(new Date(x).getDay()); k++) x += DAY;
    const dt = new Date(x);
    dt.setHours(int(9, 18), int(0, 59), int(0, 59), 0);
    return Math.min(dt.getTime(), now - int(5, 600) * 60000);
  };
  const usedPhones = new Set<string>();
  const newPhone = (rnd: () => number = r) => {
    const two = () => String(Math.floor(rnd() * 100)).padStart(2, '0');
    let phone: string;
    do phone = `06 39 98 ${two()} ${two()}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    return phone;
  };
  const customers: Cust[] = Array.from({length: int(45, 150)}, (_, i) => {
    const created = openDay(now - Math.floor(Math.pow(r(), 1.5) * 190 * DAY) - int(0, 20) * 3600000);
    const roll = r();
    const rate = d.tpl.pace * (roll < 0.15 ? 2.5 : roll < 0.5 ? 1 : roll < 0.85 ? 0.35 : 0.6); // passages par mois
    const lost = roll >= 0.85;
    const stop = lost ? Math.min(now - int(70, 140) * DAY, created + int(20, 90) * DAY) : now;
    const visits: number[] = [created];
    let t = created;
    for (;;) {
      t += (-Math.log(1 - r()) * 30 * DAY) / Math.max(0.1, rate);
      if (t >= stop) break;
      visits.push(openDay(t));
    }
    const first = pick(FIRST);
    const last = pick(LAST);
    const phone = r() < 0.8 ? newPhone() : null;
    const c: Cust = {
      id: `cu${i}`, first_name: first, last_name: last, phone,
      email: r() < 0.35 ? `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase()}@example.com` : null,
      birthday: r() < 0.6 ? `${int(1960, 2006)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}` : null,
      created_at: iso(created), last: iso(visits[visits.length - 1]), balance: 0, visits: 0, rewards: [], tx: [],
      consents: {marketing_wallet: r() < 0.85}, apple: r() < 0.55, referral_code: '', referred_by: null, referral_rewarded_at: null,
    };
    if (phone) r(); // ancien tirage (consentement retiré du produit) : gardé pour que chaque graine donne les mêmes clients
    for (const v of visits.sort((a, b) => a - b)) {
      c.balance += 1;
      c.visits += 1;
      c.tx.push({id: id(), seq: c.tx.length + 1, type: 'EARN', source: 'QR_SCAN', points_delta: 1, balance_after: c.balance, amount: null, note: null, created_at: iso(v), staff_name: pick(scanners), reversed: false});
      for (const rw of d.rewards) {
        if (c.balance === rw.threshold) c.rewards.push({id: id(), name: rw.name, status: 'AVAILABLE', earned_at: iso(v + 1000), redeemed_at: null});
      }
      if (c.balance >= threshold) c.balance = 0;
    }
    // Récompenses utilisées au passage suivant (la plupart du temps)
    for (const cr of c.rewards) {
      const next = visits.find((v) => v > new Date(cr.earned_at).getTime() + 3600000);
      if (next && r() < 0.85) {
        cr.status = 'REDEEMED';
        cr.redeemed_at = iso(next + 60000);
        c.tx.push({id: id(), seq: 0, type: 'REDEEM', source: 'QR_SCAN', points_delta: 0, balance_after: 0, amount: null, note: cr.name, created_at: cr.redeemed_at, staff_name: pick(scanners), reversed: false});
      }
    }
    c.tx.sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((x, k) => (x.seq = k + 1));
    // Solde après chaque opération (carte à tampons : remise à zéro une fois la carte complète)
    let bal = 0;
    for (const x of c.tx) {
      if (x.type === 'EARN') {
        bal += 1;
        x.balance_after = bal;
        if (bal >= threshold) bal = 0;
      } else x.balance_after = bal;
    }
    return c;
  });

  // Parrainage (Pro) : un code par client ; quelques clients parrainés par un client inscrit avant eux
  // (bonus versé à leur première visite), et deux amis parrainés pas encore venus. Tirages à part : le
  // reste du commerce ne change pas d'une offre à l'autre.
  const rr = mulberry32(seed * 11 + 5);
  const usedCodes = new Set<string>();
  const newCode = () => {
    let c = '';
    do c = Array.from({length: 8}, () => CODE_ALPHABET[Math.floor(rr() * 32)]).join('');
    while (usedCodes.has(c));
    usedCodes.add(c);
    return c;
  };
  for (const c of customers) c.referral_code = newCode();
  const byDate = [...customers].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (has('referral')) {
    byDate.forEach((c, k) => {
      const sponsor = byDate[Math.floor(rr() * k)];
      if (k > 3 && rr() < 0.12 && sponsor) {
        c.referred_by = sponsor.id;
        c.referral_rewarded_at = c.tx.find((x) => x.type === 'EARN')?.created_at ?? null;
      }
    });
    const actives = customers.filter((c) => now - new Date(c.last).getTime() < 30 * DAY);
    for (let k = 0; k < 2 && actives.length; k++) {
      const sponsor = actives[Math.floor(rr() * actives.length)];
      const created = now - (1 + Math.floor(rr() * 4)) * DAY - (1 + Math.floor(rr() * 8)) * 3600000;
      customers.push({
        id: `cu${customers.length}`, first_name: FIRST[Math.floor(rr() * FIRST.length)], last_name: LAST[Math.floor(rr() * LAST.length)], phone: newPhone(rr), email: null, birthday: null,
        created_at: iso(created), last: iso(created), balance: 0, visits: 0, rewards: [], tx: [], consents: {marketing_wallet: true}, apple: rr() < 0.55,
        referral_code: newCode(), referred_by: sponsor.id, referral_rewarded_at: null,
      });
    }
  }

  // Campagnes (canal unique : notification Wallet)
  const campaign = (c: Record<string, any>) => ({id: id(), merchant_id: d.merchant.id, channel: 'WALLET', audience_type: 'ALL', audience_filter: {}, scheduled_at: null, sent_at: null, stats: {}, error: null, prepared_by_loyna: false, ...c});
  const campaigns: any[] = [];
  for (let k = 0; k < int(1, 3); k++) {
    // la plus récente part cette semaine (compteur « Campagnes cette semaine » de l'accueil), les autres avant
    const sentAt = k === 0 ? now - ((int(6, 85) % 30) + 2) * 3600000 : now - int(6, 85) * DAY;
    const reach = customers.filter((c) => new Date(c.created_at).getTime() < sentAt && c.consents.marketing_wallet).length;
    campaigns.push(
      campaign({
        name: pick(['Offre de la semaine', 'Nouveauté du mois', 'Merci pour votre fidélité', 'Rentrée', 'Week-end gourmand']), message_title: d.merchant.name, message_body: pick(d.tpl.messages),
        sent_at: iso(sentAt), status: 'SENT', stats: {total: reach, sent: Math.round(reach * 0.93), failed: 0, skipped: reach - Math.round(reach * 0.93)}, created_at: iso(sentAt - DAY),
      }),
    );
  }
  const schedRoll = r();
  if (has('campaigns.scheduled') && schedRoll < 0.5) {
    const at = now + int(2, 6) * DAY;
    campaigns.push(campaign({name: 'Annonce programmée', message_title: d.merchant.name, message_body: pick(d.tpl.messages), scheduled_at: iso(at), status: 'SCHEDULED', created_at: iso(now - DAY)}));
  } else pick(d.tpl.messages);
  campaigns.push(campaign({name: 'Brouillon : prochaine offre', message_title: '', message_body: pick(d.tpl.messages), status: 'DRAFT', created_at: iso(now - 3600000)}));
  // Pro : campagne du prochain temps fort préparée par LOYNA, en attente de validation
  if (has('campaigns.prepared')) {
    const tf = tempsForts(new Date(now), 60).find((t) => sendAt(t, new Date(now)));
    if (tf) {
      campaigns.push(
        campaign({name: campaignName(tf), message_title: tf.title, message_body: tf.message, scheduled_at: iso(sendAt(tf, new Date(now))!.getTime()), status: 'DRAFT', prepared_by_loyna: true, created_at: iso(now - 2 * 3600000)}),
      );
    }
  }
  // Arrêt : les campagnes programmées repassent en brouillon, sans date ; le commerçant les relance après la reprise
  if (paused()) for (const c of campaigns) if (c.status === 'SCHEDULED') Object.assign(c, {status: 'DRAFT', scheduled_at: null});

  // Boutiques (notification de proximité) : une adresse, deux en Pro
  const locations: any[] = [
    {id: id(), merchant_id: d.merchant.id, label: d.merchant.name.slice(0, 60), address: d.merchant.address, postal_code: d.merchant.postal_code, city: d.merchant.city, latitude: d.merchant.latitude, longitude: d.merchant.longitude, sort_order: 0, created_at: iso(now - 190 * DAY)},
  ];
  if ((limit('locations.max') ?? 1) > 1) {
    locations.push({
      id: id(), merchant_id: d.merchant.id, label: `${d.merchant.name} · Antigone`.slice(0, 60), address: `${int(2, 40)} avenue de l’Exemple`, postal_code: '34000', city: 'Montpellier',
      latitude: round6(CENTER.lat - 0.004), longitude: round6(CENTER.lon + 0.012), sort_order: 1, created_at: iso(now - 60 * DAY),
    });
  }

  const db: Record<string, any[]> = {
    merchants: [d.merchant],
    merchant_settings: [
      {
        merchant_id: d.merchant.id, enrollment_collect_last_name: false, enrollment_collect_phone: true, enrollment_require_phone: false, enrollment_collect_email: false, enrollment_collect_birthday: true,
        terms_url: null, privacy_url: null, wallet_back_text: d.tpl.closed.includes(0) ? 'Du mardi au samedi, 9 h – 19 h.' : 'Tous les jours sauf le lundi, 7 h – 20 h.', notify_balance_updates: true,
        birthday_enabled: has('automation.birthday'), birthday_channel: 'WALLET', birthday_message: 'Joyeux anniversaire {prenom} ! Une surprise vous attend chez {commerce}.',
        inactive_enabled: has('automation.inactive'), inactive_after_days: 60, inactive_channel: 'WALLET', inactive_message: '{prenom}, cela fait longtemps ! Revenez nous voir chez {commerce}.',
        reengagement_cooldown_days: 30, marketing_min_interval_hours: 24, scan_undo_window_seconds: 120, proximity_message: d.tpl.proximity, proximity_enabled: true,
        near_reward_enabled: has('automation.near_reward'), near_reward_after_days: 7, near_reward_remaining: null, near_reward_message: '{prenom}, plus que {reste} {unite} avant votre récompense chez {commerce} !',
        review_enabled: has('automation.review'), review_url: has('automation.review') ? 'https://example.com/avis-google-demo' : null, review_after_visits: 3,
        review_message: 'Merci pour votre fidélité, {prenom} ! Votre avis compte beaucoup pour {commerce} : le lien pour laisser un avis Google est au dos de votre carte.',
        happy_hours_enabled: false, happy_hours: [], // double tampon : retiré des offres (2026-10-27), colonnes en sommeil
        tiers_enabled: has('loyalty.tiers'), tier_thresholds: [5, 15, 30], tier_perks: {BRONZE: d.tpl.perks[0], SILVER: d.tpl.perks[1], GOLD: d.tpl.perks[2]},
        referral_enabled: has('referral'), referral_bonus: 1,
      },
    ],
    merchant_locations: locations,
    loyalty_programs: [d.program],
    rewards: d.rewards,
    campaigns,
    merchant_staff: staff,
    permissions_catalog: PERMS.map(([permission, description]) => ({permission, description})),
    role_permissions: [...PERMS.map(([p]) => ({role: 'OWNER', permission: p})), ...PERMS.map(([p]) => ({role: 'ADMIN', permission: p})), ...STAFF_PERMS.map((p) => ({role: 'STAFF', permission: p}))],
    features_catalog: FEATURES_CATALOG.map(([feature, description]) => ({feature, description})),
    plan_entitlements: PLANS.flatMap((p) => PLAN_FEATURES[p].map((feature) => ({plan: p, feature, enabled: true, limit_value: LIMITS[feature]?.[p] ?? null}))),
  };
  const settings = () => db.merchant_settings[0];

  function membership(): any {
    const m = db.merchants[0];
    return {
      staff_id: 'st-owner', merchant_id: m.id, merchant_name: m.name, merchant_slug: m.slug, merchant_status: paused() ? 'SUSPENDED' : 'ACTIVE', logo_url: m.logo_url, primary_color: m.primary_color,
      secondary_color: m.secondary_color, subscription_plan: d.plan, role: 'OWNER', display_name: d.owner, permissions: PERMS.map(([p]) => p),
      features: Object.fromEntries(features().map((f) => [f, {enabled: true, limit: limit(f)}])),
    };
  }

  function summary(c: Cust) {
    const prog = db.loyalty_programs[0];
    const target = prog.reward_threshold;
    const next = db.rewards.filter((x) => x.status === 'ACTIVE' && x.threshold > c.balance).sort((a, b) => a.threshold - b.threshold)[0];
    return {
      loyalty_account_id: `acc-${c.id}`, balance: c.balance, lifetime_balance: c.tx.filter((x) => x.points_delta > 0 && !x.reversed).reduce((n, x) => n + x.points_delta, 0), visits_count: c.visits,
      program: {name: prog.name, type: prog.type, unit_singular: prog.unit_label_singular, unit_plural: prog.unit_label_plural, reward_threshold: target},
      progress: {current: c.balance, target, remaining: target - c.balance, label: `${c.balance} / ${target} ${prog.unit_label_plural}`},
      next_reward: next ? {name: next.name, remaining: next.threshold - c.balance} : null,
      available_rewards: c.rewards.filter((x) => x.status === 'AVAILABLE').map((x) => ({customer_reward_id: x.id, name: x.name, expires_at: null})),
    };
  }

  // Niveau VIP (Pro) : passages cumulés comparés aux seuils réglés
  function tier(c: Cust) {
    const s = settings();
    if (!has('loyalty.tiers') || !s.tiers_enabled) return null;
    const th: number[] = s.tier_thresholds;
    const level = c.visits >= th[2] ? 3 : c.visits >= th[1] ? 2 : c.visits >= th[0] ? 1 : 0;
    if (!level) return null;
    const earns = c.tx.filter((x) => x.type === 'EARN' && !x.reversed);
    return {level, name: TIER_NAMES[level], reached_at: earns[Math.min(earns.length, th[level - 1]) - 1]?.created_at ?? null};
  }

  const alive = () => customers.filter((c) => !c.deleted);
  const earnsIn = (c: Cust, from: number, to: number) => c.tx.filter((x) => x.type === 'EARN' && !x.reversed && new Date(x.created_at).getTime() >= from && new Date(x.created_at).getTime() < to);
  function period(from: number, to: number) {
    const per = new Map<string, number>();
    let visits = 0;
    let unlocked = 0;
    let redeemed = 0;
    for (const c of alive()) {
      const n = earnsIn(c, from, to).length;
      if (n) {
        visits += n;
        per.set(c.id, n);
      }
      for (const cr of c.rewards) {
        const e = new Date(cr.earned_at).getTime();
        if (e >= from && e < to) unlocked++;
        if (cr.redeemed_at) {
          const t = new Date(cr.redeemed_at).getTime();
          if (t >= from && t < to) redeemed++;
        }
      }
    }
    const active = per.size;
    const returning = [...per.values()].filter((n) => n >= 2).length;
    const sent = db.campaigns.filter((c) => c.sent_at && new Date(c.sent_at).getTime() >= from && new Date(c.sent_at).getTime() < to);
    return {
      visits, points_earned: visits, customers_active: active, returning_customers: returning, return_rate: active ? Math.round((1000 * returning) / active) / 10 : null,
      new_customers: alive().filter((c) => new Date(c.created_at).getTime() >= from && new Date(c.created_at).getTime() < to).length,
      rewards_unlocked: unlocked, rewards_redeemed: redeemed, campaigns_sent: sent.length,
      wallet_notifications_sent: sent.reduce((a, c) => a + (c.stats?.sent ?? 0), 0),
    };
  }

  // Campagnes par semaine (comme private.campaign_quota) : campagnes programmées, en cours ou envoyées dont l'envoi
  // tombe dans la semaine (lundi 0 h → lundi suivant, heure du navigateur), quel que soit le nombre de destinataires.
  const weekStart = (at: number) => {
    const x = new Date(at);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x.getTime();
  };
  const sendTime = (c: any) => new Date(c.sent_at ?? c.scheduled_at ?? c.created_at).getTime();
  function weekQuota(at = Date.now()) {
    const lim = limit('campaigns.weekly_quota');
    const from = weekStart(at);
    const to = weekStart(from + 8 * DAY);
    let used = db.campaigns.filter((c) => ['SCHEDULED', 'SENDING', 'SENT'].includes(c.status) && sendTime(c) >= from && sendTime(c) < to).length;
    if (usagePct && lim && from === weekStart(Date.now())) used = Math.max(used, Math.round((lim * usagePct) / 100));
    return {period: 'week', limit: lim, used, remaining: lim === null ? null : Math.max(lim - used, 0), week_start: iso(from), resets_at: iso(to)};
  }
  const mondayFr = (t: number) => new Date(t).toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'}).replace(/ 1 /, ' 1er ');
  /** Refus d'une campagne de plus (mêmes messages que private.campaign_quota_error). */
  function weekQuotaError(at: number, scheduled: boolean) {
    const q = weekQuota(at);
    if (q.limit === null || q.used < q.limit) return null;
    const offre = d.plan.charAt(0) + d.plan.slice(1).toLowerCase();
    const message = scheduled
      ? `La semaine du ${mondayFr(new Date(q.week_start).getTime())} compte déjà ${q.used > 1 ? `${q.used} campagnes envoyées ou programmées` : '1 campagne envoyée ou programmée'}, le maximum de votre offre ${offre}. Choisissez une date dans une autre semaine : le compteur repart chaque lundi.`
      : `Votre offre ${offre} comprend ${q.limit > 1 ? `${q.limit} campagnes` : '1 campagne'} par semaine : ${q.limit > 1 ? 'elles sont déjà utilisées' : 'elle est déjà utilisée'} cette semaine. Le compteur repart le ${mondayFr(new Date(q.resets_at).getTime())}.${has('campaigns.scheduled') ? ' Vous pouvez programmer cette campagne à partir de ce jour-là.' : ' Vous pourrez alors envoyer cette campagne.'}`;
    return {status: 'QUOTA_EXCEEDED', reason: 'CAMPAIGNS_PER_WEEK', message, ...q};
  }

  const periodEnd = now + ((seed % 27) + 2) * DAY;

  // Destinataires d'une campagne : groupe choisi, puis accord pour les offres Wallet
  function audience(c: any): {total: number; eligible: number} {
    const age = (t: string) => (Date.now() - new Date(t).getTime()) / DAY;
    const f = c.audience_filter ?? {};
    const month = new Date().getMonth() + 1;
    const inSeg = (x: Cust) => {
      switch (c.audience_type) {
        case 'ACTIVE':
          return age(x.last) <= 30;
        case 'INACTIVE_30':
          return age(x.last) > 30;
        case 'INACTIVE_60':
          return age(x.last) > 60;
        case 'INACTIVE_90':
          return age(x.last) > 90;
        case 'REWARD_AVAILABLE':
          return x.rewards.some((y) => y.status === 'AVAILABLE');
        case 'BIRTHDAY':
          return !!x.birthday && Number(x.birthday.slice(5, 7)) === month;
        case 'CUSTOM':
          return (
            (f.min_balance == null || x.balance >= f.min_balance) &&
            (f.min_visits == null || x.visits >= f.min_visits) &&
            (f.inactive_days == null || age(x.last) > f.inactive_days) &&
            (f.active_within_days == null || age(x.last) <= f.active_within_days) &&
            (f.enrolled_within_days == null || age(x.created_at) <= f.enrolled_within_days) &&
            (!f.has_reward_available || x.rewards.some((y) => y.status === 'AVAILABLE'))
          );
        default:
          return true;
      }
    };
    const seg = alive().filter(inSeg);
    return {total: seg.length, eligible: seg.filter((x) => x.consents.marketing_wallet).length};
  }

  // Rapport mensuel : mêmes règles que le serveur (private.build_monthly_report)
  function report(month?: string) {
    const today = new Date();
    const [y, mo] = month ? month.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1];
    const from = new Date(y, mo - 1, 1).getTime();
    const to = new Date(y, mo, 1).getTime();
    const prevFrom = new Date(y, mo - 2, 1).getTime();
    const cur = period(from, to);
    const prev = period(prevFrom, from);
    const days = new Map<number, number>();
    const hours = new Map<number, number>();
    for (const c of alive())
      for (const x of earnsIn(c, from, to)) {
        const t = new Date(x.created_at);
        const dow = ((t.getDay() + 6) % 7) + 1;
        days.set(dow, (days.get(dow) ?? 0) + 1);
        hours.set(t.getHours(), (hours.get(t.getHours()) ?? 0) + 1);
      }
    const byDay = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, visits]) => ({day, label: DAY_NAMES[day - 1], visits}));
    const top = [...hours.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([hour, visits]) => ({hour, visits}));
    const best = [...byDay].sort((a, b) => b.visits - a.visits)[0];
    const quietDay = [...byDay].sort((a, b) => a.visits - b.visits)[0];
    const edge = Math.min(to, Date.now()) - 30 * DAY;
    const winBack = alive().filter((c) => c.visits >= 2 && new Date(c.last).getTime() < edge).length;
    const waiting = alive().reduce((n, c) => n + c.rewards.filter((x) => x.status === 'AVAILABLE').length, 0);
    const s = settings();
    const tips: string[] = [];
    if (winBack > 0)
      tips.push(`${winBack > 1 ? `${winBack} bons clients ne sont pas revenus` : 'Un bon client n’est pas revenu'} depuis plus de 30 jours : envoyez-${winBack > 1 ? 'leur' : 'lui'} une campagne « Vous nous manquez »${s.inactive_enabled ? '' : ' ou activez la relance automatique des inactifs'}.`);
    if (waiting >= 3) tips.push(`${waiting} récompenses débloquées attendent d’être utilisées : rappelez-les à vos clients avec une campagne « Votre récompense vous attend ».`);
    if (cur.new_customers < 10) tips.push('Proposez la carte à chaque client au comptoir : une phrase suffit (« Vous voulez notre carte de fidélité ? Scannez ici, elle va dans votre téléphone »).');
    if (cur.return_rate !== null && cur.return_rate < 30) tips.push('Moins d’un client sur trois est revenu dans le mois : une récompense plus proche (par exemple au 8e passage au lieu du 10e) peut accélérer les retours.');
    if (best && quietDay && best.day !== quietDay.day) tips.push(`Votre meilleur jour est le ${best.label}, le plus calme le ${quietDay.label} : une campagne envoyée le ${quietDay.label} matin peut y faire venir vos clients.`);
    if (cur.campaigns_sent === 0) tips.push('Aucune campagne envoyée ce mois-ci : un message par semaine (nouveauté, offre du moment) suffit pour rester présent.');
    if (!(s.review_enabled && s.review_url)) tips.push('Activez la demande d’avis Google après la 3e visite : les avis comptent dans le classement local de Google.');
    if (prev.visits > 0 && cur.visits > prev.visits) tips.push(`Vos passages progressent de ${Math.round((100 * (cur.visits - prev.visits)) / prev.visits)} % par rapport au mois précédent : continuez à proposer la carte à chaque client.`);
    return {
      status: 'OK', merchant: {id: d.merchant.id, name: db.merchants[0].name}, month: `${y}-${String(mo).padStart(2, '0')}-01`, label: `${MONTHS[mo - 1]} ${y}`, from: iso(from), to: iso(to), complete: to <= Date.now(),
      current: cur, previous: prev, by_day: byDay, top_hours: top, best_day: best?.label ?? null,
      customers_total: alive().filter((c) => new Date(c.created_at).getTime() < to).length, customers_to_win_back: winBack, rewards_waiting: waiting, tips: tips.slice(0, 3),
    };
  }

  const wait = (ms = 220) => new Promise((res) => setTimeout(res, ms));
  let lastTx: {cust: Cust; txId: string; at: number; pts: number} | null = null;
  const FAKE_LINK = 'https://loyna.fr/espace-client/demo/#lien-fictif';

  function scanDisplay(c: Cust, unlocked: string | null) {
    const s = summary(c);
    const lines = [s.progress.label];
    if (s.next_reward) lines.push(`Prochaine récompense : ${s.next_reward.remaining} ${s.next_reward.remaining > 1 ? 'passages' : 'passage'} (${s.next_reward.name})`);
    const actions: any[] = [{type: 'UNDO', label: 'Annuler', until: iso(Date.now() + 120000)}];
    for (const x of s.available_rewards) actions.push({type: 'REDEEM', label: `Utiliser « ${x.name} »`, customer_reward_id: x.customer_reward_id});
    return unlocked
      ? {tone: 'reward', title: '🎁 Récompense débloquée', subtitle: c.first_name, lines: [unlocked, ...lines], vibrate: [80, 60, 80], actions}
      : {tone: 'success', title: '✓ Passage validé', subtitle: c.first_name, lines, vibrate: [80], actions};
  }

  /** Crédite un compte (passage ou bonus) : récompenses débloquées au passage d'un seuil, carte remise à zéro une fois complète. */
  function credit(c: Cust, pts: number, type: 'EARN' | 'ADJUSTMENT', note: string | null, amount: number | null = null): {txId: string; unlocked: string | null} {
    const before = c.balance;
    c.balance += pts;
    let unlocked: string | null = null;
    for (const rw of db.rewards.filter((x) => x.status === 'ACTIVE')) {
      if (before < rw.threshold && c.balance >= rw.threshold) {
        unlocked = rw.name;
        c.rewards.push({id: id(), name: rw.name, status: 'AVAILABLE', earned_at: iso(Date.now()), redeemed_at: null});
      }
    }
    const txId = id();
    c.tx.push({id: txId, seq: c.tx.length + 1, type, source: type === 'EARN' ? 'QR_SCAN' : 'REFERRAL', points_delta: pts, balance_after: c.balance, amount, note, created_at: iso(Date.now()), staff_name: d.owner, reversed: false});
    return {txId, unlocked};
  }
  const resetCard = (c: Cust) => {
    const th = db.loyalty_programs[0].reward_threshold;
    while (c.balance >= th) c.balance -= th;
  };

  const backend = {
    demo: true,
    // Recherche d'adresse simulée : suggestions fictives construites à partir du texte saisi (rien n'est envoyé)
    async geocode(q: string): Promise<GeoResult[]> {
      await wait(260);
      const text = q.trim().replace(/\s+/g, ' ').replace(/,?\s*\d{5}.*$/, '');
      if (text.length < 3) return [];
      const street = text.charAt(0).toUpperCase() + text.slice(1);
      let h = 0;
      for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
      const jitter = (k: number) => (((h >>> k) & 0xff) / 255 - 0.5) * 0.01;
      return [
        {postal_code: '34000', city: 'Montpellier', score: 0.93, dlat: 0, dlon: 0},
        {postal_code: '34070', city: 'Montpellier', score: 0.71, dlat: -0.012, dlon: -0.009},
        {postal_code: '34170', city: 'Castelnau-le-Lez', score: 0.52, dlat: 0.018, dlon: 0.021},
      ].map((x, k) => ({
        label: `${street} ${x.postal_code} ${x.city}`, address: street, postal_code: x.postal_code, city: x.city, score: x.score,
        latitude: round6(CENTER.lat + x.dlat + jitter(k * 3)), longitude: round6(CENTER.lon + x.dlon + jitter(k * 3 + 8)),
      }));
    },
    async getSession() {
      try {
        return sessionStorage.getItem('demo-session') === 'out' ? null : {email: staff[0].email};
      } catch {
        return {email: staff[0].email};
      }
    },
    onAuthChange() {},
    async signIn(email: string) {
      await wait(300);
      if (!email.includes('@')) throw new ApiError('AUTH', 'E-mail ou mot de passe incorrect.');
      sessionStorage.setItem('demo-session', '1');
    },
    async signOut() {
      sessionStorage.setItem('demo-session', 'out');
    },
    async updatePassword() {
      await wait();
    },
    async rpc(fn: string, a: any = {}): Promise<any> {
      await wait();
      switch (fn) {
        case 'my_staff_context':
          return {user_id: 'u-owner', is_platform_admin: operatorDemo !== null, memberships: orderDemo === null && operatorDemo !== 'seul' ? [membership()] : []};
        case 'my_orders':
          return {
            status: 'OK',
            email: staff[0].email,
            orders:
              orderDemo === '0'
                ? []
                : [
                    {
                      plan: 'PRO', billing_period: 'monthly', subscription_status: 'active', ordered_at: iso(now - 3600000), current_period_end: iso(now + 30 * DAY),
                      commitment_end: iso(now + 365 * DAY), cancel_at: null, business_name: d.merchant.name, merchant_linked: false,
                      items: [
                        {lookup_key: 'loyna_pro_commit12', label: 'LOYNA Pro', quantity: 1, amount: 4165},
                        {lookup_key: 'loyna_qr_verre', label: 'QR code personnalisé sous verre', quantity: 3, amount: 2997},
                        {lookup_key: 'loyna_qr_verre_5', label: 'Pack de 5 QR codes personnalisés sous verre', quantity: 1, amount: 4249},
                      ],
                    },
                  ],
          };
        case 'search_customers': {
          const q = (a.p_query ?? '').toLowerCase();
          const age = (t: string) => (now - new Date(t).getTime()) / DAY;
          let list = alive().filter((c) => !q || `${c.first_name} ${c.last_name} ${c.phone ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q));
          if (a.p_filter === 'ACTIVE') list = list.filter((c) => age(c.last) <= 30);
          if (a.p_filter === 'INACTIVE') list = list.filter((c) => age(c.last) > 60);
          if (a.p_filter === 'NEW') list = list.filter((c) => age(c.created_at) <= 30);
          if (a.p_filter === 'REWARD_AVAILABLE') list = list.filter((c) => c.rewards.some((x) => x.status === 'AVAILABLE'));
          list.sort((x, y) => y.last.localeCompare(x.last));
          return {
            total: list.length,
            contact_visible: true,
            items: list.slice(a.p_offset, a.p_offset + a.p_limit).map((c) => ({
              id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, status: 'ACTIVE', balance: c.balance, visits_count: c.visits,
              rewards_available: c.rewards.filter((x) => x.status === 'AVAILABLE').length, last_activity_at: c.last, created_at: c.created_at,
            })),
          };
        }
        case 'get_customer_detail': {
          const c = alive().find((x) => x.id === a.p_customer_id);
          if (!c) return {status: 'NOT_FOUND'};
          const sponsor = c.referred_by ? customers.find((x) => x.id === c.referred_by && !x.deleted) : null;
          return {
            status: 'OK',
            customer: {id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, birthday: c.birthday, status: 'ACTIVE', source: 'JOIN_PAGE', created_at: c.created_at, last_activity_at: c.last},
            account: summary(c),
            tier: tier(c),
            referral: {code: c.referral_code, referred_by: sponsor ? {id: sponsor.id, first_name: sponsor.first_name} : null, referrals: alive().filter((x) => x.referred_by === c.id).length, rewarded_at: c.referral_rewarded_at},
            transactions: [...c.tx].reverse().slice(0, 50),
            rewards: [...c.rewards].reverse(),
            consents: {loyalty_terms: true, ...c.consents, consent_timestamp: c.created_at, consent_version: 'loyna-2026-09'},
            wallet: {pass_status: 'ACTIVE', apple_devices: c.apple ? 1 : 0, apple_last_fetched_at: null, google_object: !c.apple, google_has_users: !c.apple},
            permissions: {can_adjust: true, can_reverse_any: true, can_manage: true, can_redeem: true, can_reissue_card: true},
          };
        }
        case 'update_customer_consents': {
          const c = alive().find((x) => x.id === a.p_customer_id);
          if (!c) return {status: 'NOT_FOUND'};
          if (a.p_marketing_wallet) return {status: 'CUSTOMER_MUST_OPT_IN', hint: 'Un consentement marketing ne peut être donné que par le client lui-même.'};
          if (a.p_marketing_wallet === false) c.consents.marketing_wallet = false;
          return {status: 'OK'};
        }
        case 'dashboard_kpis': {
          const days = a.p_days;
          const to = Date.now();
          const from = to - days * DAY;
          const avail = alive().reduce((n, c) => n + c.rewards.filter((x) => x.status === 'AVAILABLE').length, 0);
          return {
            merchant_id: d.merchant.id, period_days: days, from: iso(from), to: iso(to), current: period(from, to), previous: period(from - days * DAY, from),
            totals: {customers: alive().length, rewards_available: avail, wallet_passes: alive().length, apple_wallet_installed: alive().filter((c) => c.apple).length, google_wallet_objects: alive().filter((c) => !c.apple).length},
          };
        }
        case 'my_plan_usage':
          return {merchant_id: d.merchant.id, plan: d.plan, cards: {used: alive().length, limit: null}, campaigns: weekQuota(), locations: {used: db.merchant_locations.length, limit: limit('locations.max')}};
        case 'my_service_state':
          return serviceState();
        case 'my_pending_referral':
          return {status: 'OK', code: null};
        case 'export_merchant_customers':
          // Mêmes colonnes que la RPC du dépôt LOYNA
          return alive().map((c) => ({
            first_name: c.first_name, last_name: c.last_name, phone: c.phone ? c.phone.replace(/\s/g, '').replace(/^0/, '+33') : null, email: c.email, birthday: c.birthday, balance: c.balance, visits_count: c.visits, created_at: c.created_at, marketing_wallet: c.consents.marketing_wallet,
          }));
        case 'monthly_report':
          if (!has('reports.monthly')) return {status: 'FEATURE_NOT_AVAILABLE', feature: 'reports.monthly'};
          return report(a.p_month);
        case 'analytics_timeseries': {
          if (!has('analytics.advanced')) return {status: 'FEATURE_NOT_AVAILABLE', feature: 'analytics.advanced'};
          const days = a.p_days;
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const buckets = Array.from({length: days}, (_, k) => ({date: iso(start.getTime() - (days - 1 - k) * DAY), value: 0}));
          const add = (t: string) => {
            const k = Math.floor((new Date(t).getTime() - (start.getTime() - (days - 1) * DAY)) / DAY);
            if (k >= 0 && k < days) buckets[k].value++;
          };
          for (const c of alive()) {
            if (a.p_metric === 'new_customers') add(c.created_at);
            else if (a.p_metric === 'visits') c.tx.filter((x) => x.type === 'EARN' && !x.reversed).forEach((x) => add(x.created_at));
            else if (a.p_metric === 'rewards_redeemed') c.rewards.filter((x) => x.redeemed_at).forEach((x) => add(x.redeemed_at!));
            else c.rewards.forEach((x) => add(x.earned_at));
          }
          return {status: 'OK', metric: a.p_metric, timezone: 'Europe/Paris', points: buckets};
        }
        case 'update_loyalty_program': {
          const p = db.loyalty_programs[0];
          if ((a.p_changes.type && a.p_changes.type !== p.type) || (a.p_changes.reset_behavior && a.p_changes.reset_behavior !== p.reset_behavior))
            return {status: 'PROGRAM_HAS_ACTIVITY', hint: 'Le type et le mode de remise à zéro ne sont modifiables qu’avant le premier passage.'};
          Object.assign(p, a.p_changes);
          return {status: 'OK', program: {...p}};
        }
        case 'adjust_points': {
          if (paused()) return {status: 'MERCHANT_PAUSED'};
          const c = customers.find((x) => `acc-${x.id}` === a.p_loyalty_account_id)!;
          if (c.balance + a.p_points_delta < 0) return {status: 'INSUFFICIENT_BALANCE'};
          c.balance += a.p_points_delta;
          c.tx.push({id: id(), seq: c.tx.length + 1, type: 'ADJUSTMENT', source: 'MANUAL', points_delta: a.p_points_delta, balance_after: c.balance, amount: null, note: a.p_reason, created_at: iso(Date.now()), staff_name: d.owner, reversed: false});
          return {status: 'OK'};
        }
        case 'my_referral': {
          // Parrainage LOYNA fictif : code tiré de la graine, filleuls aux noms de commerces inventés ; un filleul « gagné » a payé
          // sa première mensualité, environ un mois après sa souscription (premier mois offert)
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const code = 'LOYNA-' + Array.from({length: 6}, (_, k) => alphabet[(seed * (k + 7) + k * 13) % 32]).join('');
          const live = hasSubscription() && !paused();
          return {
            status: 'OK', code, link: `https://loyna.fr/panier/?parrain=${code}`, eligibility: live ? 'ACTIVE' : 'NO_SUBSCRIPTION',
            months_applied: live ? 1 : 0, months_waiting: live ? 1 : 0,
            referrals: !live ? [] : [
              {name: 'Fleurs de la Place (démo)', status: 'gagne', created_at: iso(now - 38 * DAY), won_at: iso(now - 8 * DAY), applied_at: null},
              {name: 'Le Fournil du Coin (démo)', status: 'applique', created_at: iso(now - 80 * DAY), won_at: iso(now - 49 * DAY), applied_at: iso(now - 49 * DAY)},
              {name: 'Atelier Barbe & Co (démo)', status: 'en_attente_paiement', created_at: iso(now - DAY), won_at: null, applied_at: null},
            ],
          };
        }
        case 'op_orders':
        case 'op_merchants':
        case 'op_set_merchant_suspension':
        case 'op_set_billing_exempt':
        case 'op_extend_trial':
        case 'op_extend_retention':
        case 'op_prepare_campaign':
        case 'op_unlinked_subscriptions':
        case 'op_attach_subscription':
        case 'op_release_trial_siret':
          if (import.meta.env.DEV && operatorDemo !== null) return (await import('./mock-operateur')).operatorRpc(fn, operatorSelf(), a);
          break;
        case 'op_merchant_context':
          // « Ouvrir son espace » (écran Opérateur) : commerce de la liste fictive, avec les fonctions de son offre
          if (import.meta.env.DEV && operatorDemo !== null) {
            const list: any[] = (await (await import('./mock-operateur')).operatorRpc('op_merchants', operatorSelf())).merchants;
            const x = list.find((m) => m.id === a.p_merchant_id);
            if (!x) return {status: 'NOT_FOUND'};
            const p: Plan = PLANS.includes(x.subscription_plan) ? x.subscription_plan : 'STARTER';
            return {
              status: 'OK',
              merchant: {
                merchant_id: x.id, merchant_name: x.name, merchant_slug: x.slug, merchant_status: x.status, logo_url: x.logo_url, primary_color: x.primary_color,
                secondary_color: x.secondary_color, subscription_plan: p, features: Object.fromEntries(PLAN_FEATURES[p].map((f) => [f, {enabled: true, limit: LIMITS[f]?.[p] ?? null}])), demo_mode: x.demo_mode,
              },
            };
          }
          break;
        case 'my_subscription':
          if (!hasSubscription()) return {status: 'NONE'};
          return {
            status: 'OK', plan: d.plan, billing_period: 'monthly', subscription_status: mode === 'GRACE' ? 'past_due' : mode === 'STOP_PAY' ? 'unpaid' : mode === 'STOP_END' ? 'canceled' : 'active', cancel_at_period_end: false, cancel_at: null,
            canceled_at: mode === 'STOP_END' ? iso(stoppedAt) : null, current_period_end: iso(mode === 'STOP_END' ? stoppedAt : periodEnd), commitment_end: commitmentEnd, customer_email: staff[0].email,
          };
      }
      throw new ApiError('UNKNOWN', 'Fonction non disponible en démonstration.');
    },
    async rpcRows(fn: string, a: any = {}): Promise<any[]> {
      return backend.rpc(fn, a);
    },
    async edge(fn: string, b: any): Promise<any> {
      await wait(320);
      switch (fn) {
        case 'trial':
          return {status: 'NONE'}; // compte sans commerce de la démonstration (?demo&commande)
        case 'subscription-change': {
          // Tableau de la section 2.4 du cahier des charges (fonction subscription-change du dépôt LOYNA)
          if (d.plan === 'PREMIUM') throw new ApiError('LEGACY_PLAN', 'Votre offre historique ne se change pas ici : écrivez à contact@loyna.fr.', 409);
          if (!hasSubscription() || mode !== 'ACTIVE') throw new ApiError('NO_SUBSCRIPTION', 'Aucun abonnement à changer pour ce commerce.', 409);
          const want = VENTE.find((p) => p.id === String(b.plan).toLowerCase());
          if (!want) throw new ApiError('INVALID_REQUEST', 'Offre inconnue.', 400);
          if (engaged() && (!b.engagement || (d.plan === 'PRO' && want.id === 'starter'))) {
            throw new ApiError('COMMITMENT_ACTIVE', `Votre engagement court jusqu’au ${new Date(commitmentEnd!).toLocaleDateString('fr-FR')} : ce changement sera possible à cette date.`, 409);
          }
          if (!engaged()) commitmentEnd = b.engagement ? iso(Date.now() + 365 * DAY) : null;
          d.plan = want.id.toUpperCase() as Plan;
          return {status: 'OK', price_cents: Math.round((b.engagement ? want.engaged : want.monthly) * 100), commitment_end: commitmentEnd};
        }
        case 'validate-visit': {
          if (paused()) return {status: 'MERCHANT_INACTIVE', display: PAUSED_DISPLAY};
          if (b.action === 'undo') {
            if (!lastTx) return {status: 'NOT_FOUND', display: {tone: 'error', title: 'Annulation impossible', lines: [], actions: []}};
            const {cust, txId, pts} = lastTx;
            const x = cust.tx.find((t) => t.id === txId);
            if (x) x.reversed = true;
            cust.balance = Math.max(0, cust.balance - pts);
            cust.visits = Math.max(0, cust.visits - 1);
            lastTx = null;
            return {status: 'REVERSED', display: {tone: 'info', title: 'Passage annulé', subtitle: cust.first_name, lines: [summary(cust).progress.label], actions: []}};
          }
          if (!/^loyna:v1:/.test(b.qr)) return {status: 'INVALID_QR', display: {tone: 'error', title: 'QR code non reconnu', subtitle: 'Ce n’est pas une carte LOYNA.', lines: [], vibrate: [200], actions: []}};
          // Re-scan d'une même carte dans le délai : « Passage déjà enregistré »
          const again = lastTx && (b.qr.includes('delai') || (Date.now() - lastTx.at < 60 * 60000 && r() < 0.12));
          if (again && !b.override_cooldown) {
            const who = lastTx?.cust.first_name ?? 'Client';
            return {status: 'COOLDOWN', retry_after_seconds: 3000, can_override: true, display: {tone: 'warning', title: 'Passage déjà enregistré', subtitle: who, lines: ['Dernier passage il y a quelques minutes', 'Nouveau passage possible dans 50 min'], vibrate: [120, 80, 120], actions: [{type: 'OVERRIDE', label: 'Forcer le passage'}]}};
          }
          // Ami parrainé pas encore venu : sa première visite déclenche le bonus de parrainage (Pro)
          const s = settings();
          const referralOn = has('referral') && s.referral_enabled;
          const newcomers = referralOn ? alive().filter((c) => c.visits === 0 && c.referred_by && !c.referral_rewarded_at) : [];
          const pool = alive().filter((c) => (now - new Date(c.last).getTime()) / DAY < 60);
          const c = again && lastTx ? lastTx.cust : newcomers.length && (b.qr.includes('parrain') || r() < 0.3) ? newcomers[0] : pick(pool.length ? pool : alive());
          let referral: {bonus: number; referrer_credited: boolean} | null = null;
          let unlocked: string | null = null;
          if (referralOn && c.visits === 0 && c.referred_by && !c.referral_rewarded_at) {
            const bonus = s.referral_bonus;
            unlocked = credit(c, bonus, 'ADJUSTMENT', 'Bonus de parrainage (bienvenue)').unlocked;
            const sponsor = alive().find((x) => x.id === c.referred_by);
            if (sponsor) {
              credit(sponsor, bonus, 'ADJUSTMENT', 'Bonus de parrainage (ami parrainé)');
              resetCard(sponsor);
            }
            c.referral_rewarded_at = iso(Date.now());
            referral = {bonus, referrer_credited: !!sponsor};
          }
          const pts = db.loyalty_programs[0].points_per_event;
          const earned = credit(c, pts, 'EARN', null, b.amount ?? null);
          unlocked = earned.unlocked ?? unlocked;
          c.visits += 1;
          c.last = iso(Date.now());
          const display = scanDisplay(c, unlocked);
          resetCard(c);
          lastTx = {cust: c, txId: earned.txId, at: Date.now(), pts};
          const prog = db.loyalty_programs[0];
          return {
            status: 'OK', transaction_id: earned.txId, customer: {id: c.id, first_name: c.first_name}, points_added: pts, referral_bonus: referral,
            program: {name: prog.name, type: prog.type, unit_singular: prog.unit_label_singular, unit_plural: prog.unit_label_plural, reward_threshold: prog.reward_threshold}, display,
          };
        }
        case 'redeem-reward': {
          if (paused()) return {status: 'MERCHANT_PAUSED', display: PAUSED_DISPLAY};
          for (const c of customers) {
            const x = c.rewards.find((y) => y.id === b.customer_reward_id);
            if (x) {
              if (x.status === 'REDEEMED') return {status: 'ALREADY_REDEEMED', display: {tone: 'warning', title: 'Récompense déjà utilisée', subtitle: c.first_name, lines: [], actions: []}};
              x.status = 'REDEEMED';
              x.redeemed_at = iso(Date.now());
              c.tx.push({id: id(), seq: c.tx.length + 1, type: 'REDEEM', source: 'QR_SCAN', points_delta: 0, balance_after: c.balance, amount: null, note: x.name, created_at: x.redeemed_at, staff_name: d.owner, reversed: false});
              return {status: 'REDEEMED', display: {tone: 'reward', title: 'Récompense utilisée', subtitle: c.first_name, lines: [x.name], actions: []}};
            }
          }
          return {status: 'NOT_AVAILABLE', display: {tone: 'error', title: 'Récompense indisponible', lines: [], actions: []}};
        }
        case 'campaign-send': {
          const c = db.campaigns.find((x) => x.id === b.campaign_id);
          if (!c) throw new ApiError('NOT_FOUND', 'Campagne introuvable.', 404);
          const missing = c.audience_type !== 'ALL' && !has('segmentation') ? 'segmentation' : null;
          if (b.action === 'preview') {
            const aud = audience(c);
            const q = weekQuota(c.scheduled_at && new Date(c.scheduled_at).getTime() > Date.now() ? new Date(c.scheduled_at).getTime() : Date.now());
            return {
              status: 'OK', campaign_id: c.id, channel: 'WALLET', audience_type: c.audience_type, audience_total: aud.total, eligible: aud.eligible, skipped: {NO_CONSENT: aud.total - aud.eligible},
              feature_missing: missing, prepared_by_loyna: !!c.prepared_by_loyna, campaigns_quota: q, quota_ok: q.remaining === null || q.remaining > 0,
            };
          }
          if (b.action === 'launch') {
            if (paused()) return {status: 'MERCHANT_PAUSED', campaign_id: c.id};
            if (c.status !== 'DRAFT') return {status: 'INVALID_STATUS', campaign_status: c.status};
            const when = b.scheduled_at ?? c.scheduled_at;
            const scheduled = !!when && new Date(when).getTime() > Date.now() + 60000;
            if (missing || (scheduled && !has('campaigns.scheduled'))) return {status: 'FEATURE_NOT_AVAILABLE', feature: missing ?? 'campaigns.scheduled'};
            const aud = audience(c);
            const refused = weekQuotaError(scheduled ? new Date(when).getTime() : Date.now(), scheduled);
            if (refused) return {...refused, campaign_id: c.id};
            c.status = scheduled ? 'SCHEDULED' : 'SENT';
            c.scheduled_at = scheduled ? when : null;
            c.sent_at = scheduled ? null : iso(Date.now());
            c.stats = scheduled ? {} : {total: aud.total, sent: aud.eligible, failed: 0, skipped: aud.total - aud.eligible};
            return scheduled ? {status: 'SCHEDULED', campaign_id: c.id, scheduled_at: when} : {status: 'SENDING', campaign_id: c.id, eligible: aud.eligible};
          }
          if (b.action === 'cancel') {
            c.status = 'CANCELLED';
            return {status: 'CANCELLED'};
          }
          const sent = c.stats?.sent ?? 0;
          const back = Math.round(sent * (0.15 + (seed % 20) / 100));
          return {status: 'OK', recipients_sent: sent, returned_within_7_days: back, return_rate_7_days: sent ? Math.round((1000 * back) / sent) / 10 : null};
        }
        case 'staff-manage':
          if (b.action === 'invite') {
            db.merchant_staff.push({id: id(), merchant_id: d.merchant.id, user_id: id(), role: b.role, status: 'INVITED', display_name: b.display_name, email: b.email, permissions: {}, last_seen_at: null, created_at: iso(Date.now())});
            return {status: 'ADDED', setup_link: FAKE_LINK};
          }
          if (b.action === 'reset_link') return {setup_link: FAKE_LINK};
          {
            const s = db.merchant_staff.find((x) => x.id === b.staff_id);
            if (b.action === 'remove') s.status = 'DISABLED';
            if (b.status) s.status = b.status;
            if (b.role) s.role = b.role;
            if (b.permissions) s.permissions = b.permissions;
            if (b.display_name) s.display_name = b.display_name;
            return {status: 'OK'};
          }
        case 'merchant-bootstrap':
          if (import.meta.env.DEV && operatorDemo !== null) return (await import('./mock-operateur')).operatorEdge(b, operatorSelf());
          break;
        case 'apple-pass-create':
          return {apple_pass_url: FAKE_LINK, qr_rotated: !!b.rotate_qr};
        case 'google-wallet-create':
          return {google_save_url: FAKE_LINK};
        case 'customer-privacy': {
          const c = customers.find((x) => x.id === b.customer_id)!;
          if (b.action === 'export') return {demo: 'Données fictives de démonstration', customer: {first_name: c.first_name, last_name: c.last_name, created_at: c.created_at}, transactions: c.tx};
          if (b.action === 'delete') {
            c.deleted = true;
            return {status: 'DELETED'};
          }
          if (b.marketing_wallet === false) c.consents.marketing_wallet = false;
          return {status: 'OK'};
        }
      }
      throw new ApiError('UNKNOWN', 'Fonction non disponible en démonstration.');
    },
    async select(table: string, opts: SelectOptions = {}): Promise<any[]> {
      await wait(120);
      let rows = [...(db[table] ?? [])];
      for (const [k, v] of Object.entries(opts.eq ?? {})) rows = rows.filter((x) => x[k] === v);
      for (const [k, v] of Object.entries(opts.neq ?? {})) rows = rows.filter((x) => x[k] !== v);
      if (opts.order) {
        const [col, asc = true] = opts.order;
        rows.sort((x, y) => (x[col] > y[col] ? 1 : x[col] < y[col] ? -1 : 0) * (asc ? 1 : -1));
      }
      return JSON.parse(JSON.stringify(opts.limit ? rows.slice(0, opts.limit) : rows));
    },
    async insert(table: string, row: any): Promise<any> {
      await wait(180);
      if (table === 'rewards' && (row.status ?? 'ACTIVE') === 'ACTIVE' && db.rewards.some((x) => x.status === 'ACTIVE' && x.threshold === row.threshold)) throw new ApiError('23505', 'Cet élément existe déjà (doublon).');
      if (table === 'merchant_locations') {
        const lim = limit('locations.max');
        if (lim !== null && db.merchant_locations.length >= lim) throw new ApiError('LOCATIONS_LIMIT', `Votre offre inclut ${lim} boutique(s).`);
      }
      const x: any = {id: id(), created_at: iso(Date.now()), ...row};
      if (table === 'campaigns') Object.assign(x, {status: 'DRAFT', stats: {}, sent_at: null, error: null, prepared_by_loyna: false, scheduled_at: row.scheduled_at ?? null});
      if (table === 'rewards') x.status = row.status ?? 'ACTIVE';
      db[table].push(x);
      return JSON.parse(JSON.stringify(x));
    },
    async update(table: string, match: Match, changes: any): Promise<any> {
      await wait(180);
      const x = db[table].find((y) => Object.entries(match).every(([k, v]) => y[k] === v));
      if (!x) throw new ApiError('PGRST116', 'Élément introuvable.');
      if (table === 'merchant_settings') checkSettings({...x, ...changes});
      Object.assign(x, changes);
      return JSON.parse(JSON.stringify(x));
    },
    async remove(table: string, match: Match) {
      await wait(120);
      db[table] = db[table].filter((y) => !Object.entries(match).every(([k, v]) => y[k] === v));
    },
    async uploadPublic(_b: string, _p: string, file: Blob) {
      await wait(250);
      return URL.createObjectURL(file);
    },
  };
  return backend as unknown as Backend;
}

/**
 * Espace d'un commerce de l'écran Opérateur, ouvert en consultation dans la démonstration locale (?demo&operateur) :
 * clients, passages et campagnes fictifs tirés d'une graine propre à ce commerce, sous son nom et ses couleurs.
 */
export function consultationBackend(m: {merchant_id: string; merchant_name: string; merchant_slug: string; logo_url: string | null; primary_color: string; secondary_color: string; subscription_plan: string; demo_mode?: DemoMode}): Backend {
  let h = 7;
  for (const ch of m.merchant_id) h = (h * 31 + ch.charCodeAt(0)) % 899999;
  const plan: Plan = PLANS.find((p) => p === m.subscription_plan) ?? 'STARTER';
  return createMockBackend(100000 + h, plan, {id: m.merchant_id, name: m.merchant_name, slug: m.merchant_slug, logo_url: m.logo_url, primary_color: m.primary_color, secondary_color: m.secondary_color}, m.demo_mode ?? 'ACTIVE');
}

/** Mêmes contrôles que le serveur (private.validate_merchant_settings et contraintes de la table). */
function checkSettings(s: any) {
  for (const [k, v] of Object.entries(s.tier_perks ?? {})) {
    if (!['BRONZE', 'SILVER', 'GOLD'].includes(k) || typeof v !== 'string' || v.length > 80) throw new ApiError('TIER_PERKS_INVALID', 'Avantages attendus : BRONZE, SILVER, GOLD (80 caractères au plus).');
  }
  const t = s.tier_thresholds ?? [5, 15, 30];
  if (t.length !== 3 || !(t[0] >= 1 && t[0] < t[1] && t[1] < t[2] && t[2] <= 100000)) throw new ApiError('23514', 'Une valeur saisie n’est pas acceptée : vérifiez le formulaire.');
}

/** Page d'inscription de démonstration (loyna.fr/join/demo-<graine>), cohérente avec le commerce fictif ; `paused` : programme en pause. */
export function demoJoinPage(seed: number, opts: {plan?: Plan; full?: boolean; paused?: boolean} = {}) {
  const d = demoMerchant(seed, opts.plan ?? 'PRO');
  const referral = PLAN_FEATURES[d.plan].includes('referral');
  return {
    status: opts.paused ? ('PAUSED' as const) : ('OK' as const),
    demo: true,
    merchant: {name: d.merchant.name, slug: d.merchant.slug, business_type: d.merchant.business_type, logo_url: null, primary_color: d.merchant.primary_color, secondary_color: d.merchant.secondary_color, city: d.merchant.city, website: null},
    program: {name: d.program.name, type: 'VISITS', points_per_event: 1, spend_points_per_unit: null, reward_threshold: d.program.reward_threshold, unit_singular: 'passage', unit_plural: 'passages'},
    rewards: [...d.rewards].sort((a, b) => a.threshold - b.threshold).map((x) => ({name: x.name, description: null, threshold: x.threshold})),
    form: {collect_last_name: false, collect_phone: true, require_phone: false, collect_email: false, collect_birthday: true},
    enrollment_open: !opts.full,
    referral: referral ? {bonus: 1, unit: 'passage'} : null,
    legal: {terms_url: null, privacy_url: null, consent_version: 'loyna-2026-09'},
    platform: null,
  };
}
