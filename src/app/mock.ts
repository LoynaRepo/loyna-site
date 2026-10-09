// Démonstration de LOYNA Business (loyna.fr/espace-client/demo/, et ?demo en développement) :
// un commerce fictif tiré au hasard, avec clients, passages, récompenses, campagnes et équipe générés
// à partir d'une « graine ». Tout reste en mémoire dans le navigateur : aucune requête réseau, rien
// n'est enregistré. Les numéros de téléphone utilisent la tranche 06 39 98 réservée par l'ARCEP à la
// fiction, les e-mails le domaine réservé example.com.
import {ApiError} from './http';
import type {Backend, Match, SelectOptions} from './backend';

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

// --- Référentiels ------------------------------------------------------------------------------------
type Plan = 'ESSENTIEL' | 'GROWTH' | 'PRO';
const PLAN_FEATURES: Record<Plan, string[]> = {
  ESSENTIEL: ['wallet.apple', 'wallet.google', 'wallet.notifications', 'enrollment.qr', 'loyalty.visits', 'loyalty.points', 'loyalty.spend', 'rewards', 'scanner', 'dashboard', 'campaigns.wallet'],
  GROWTH: [],
  PRO: [],
};
PLAN_FEATURES.GROWTH = [...PLAN_FEATURES.ESSENTIEL, 'analytics.advanced', 'automation.birthday', 'automation.inactive', 'campaigns.scheduled', 'segmentation', 'sms', 'sms.monthly_quota'];
PLAN_FEATURES.PRO = [...PLAN_FEATURES.GROWTH, 'api.webhooks', 'automation.advanced', 'integrations', 'support.priority', 'validation.automatic'];
const SMS_QUOTA: Record<Plan, number | null> = {ESSENTIEL: null, GROWTH: 200, PRO: 500};

const FEATURES_CATALOG: [string, string][] = [
  ['wallet.apple', 'Carte Apple Wallet'], ['wallet.google', 'Carte Google Wallet'], ['wallet.notifications', 'Notifications Wallet'], ['enrollment.qr', 'Inscription par QR code'],
  ['loyalty.visits', 'Programme au passage'], ['loyalty.points', 'Programme à points'], ['loyalty.spend', 'Programme au montant dépensé'], ['rewards', 'Récompenses'],
  ['scanner', 'Scanner LOYNA Business'], ['dashboard', 'Tableau de bord'], ['campaigns.wallet', 'Campagnes par notification Wallet'], ['sms', 'Envoi de SMS'],
  ['sms.monthly_quota', 'Quota mensuel de SMS (segments)'], ['segmentation', 'Segmentation des campagnes'], ['automation.birthday', 'Automatisation anniversaires'],
  ['automation.inactive', 'Relance des clients inactifs'], ['campaigns.scheduled', 'Campagnes programmées'], ['analytics.advanced', 'Statistiques avancées'],
  ['integrations', 'Intégrations (caisse, réservation, paiement)'], ['validation.automatic', 'Validation automatique des passages'], ['automation.advanced', 'Automatisations avancées'],
  ['api.webhooks', 'API et webhooks'], ['support.priority', 'Support prioritaire'],
];
const PERMS: [string, string][] = [
  ['scan.validate', 'Scanner une carte et valider un passage'], ['scan.override_cooldown', 'Forcer un passage malgré le délai anti-double scan'],
  ['scan.custom_points', 'Saisir un nombre de points personnalisé'], ['transactions.reverse_own', 'Annuler son propre passage récent'],
  ['transactions.reverse_any', 'Annuler n’importe quel passage'], ['transactions.adjust', 'Ajuster manuellement un solde'],
  ['rewards.redeem', 'Valider l’utilisation d’une récompense'], ['customers.read_basic', 'Voir prénom, solde et récompenses des clients'],
  ['customers.read', 'Voir la fiche client complète (coordonnées)'], ['customers.manage', 'Modifier, exporter ou supprimer un client'],
  ['program.manage', 'Modifier le programme de fidélité'], ['rewards.manage', 'Gérer les récompenses'], ['campaigns.manage', 'Préparer des campagnes'],
  ['campaigns.send', 'Envoyer ou programmer des campagnes'], ['team.manage', 'Gérer l’équipe'], ['settings.manage', 'Modifier la configuration et le branding'],
  ['analytics.read', 'Consulter les statistiques'], ['audit.read', 'Consulter le journal d’audit'], ['integrations.manage', 'Gérer les intégrations'],
  ['wallet.reissue', 'Renvoyer le lien d’ajout de la carte Wallet'],
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
}
const TEMPLATES: Template[] = [
  {type: 'Coiffure', names: ['Maison Lumière', 'Salon Céleste', 'L’Atelier des Mèches'], threshold: 10, rewards: [[10, 'Brushing offert', 'FREE_ITEM'], [5, '-10 % sur les soins', 'DISCOUNT_PERCENT', 10]], closed: [0, 1], pace: 1, messages: ['{prenom}, nos soins d’automne arrivent : -15 % toute la semaine chez {commerce}.', 'Envie de changement, {prenom} ? Nouvelles couleurs disponibles chez {commerce}.']},
  {type: 'Boulangerie', names: ['Boulangerie du Moulin Doré', 'Le Fournil Ambré'], threshold: 10, rewards: [[10, 'Viennoiserie offerte', 'FREE_ITEM']], closed: [1], pace: 6, messages: ['{prenom}, la galette maison est de retour chez {commerce} !', 'Nouveau : pain aux noix tous les vendredis chez {commerce}.']},
  {type: 'Café', names: ['Café Comptoir Ambre', 'Le Petit Torréfacteur'], threshold: 8, rewards: [[8, 'Café offert', 'FREE_ITEM']], closed: [0], pace: 5, messages: ['{prenom}, notre nouveau café de saison vous attend chez {commerce}.', 'Happy hour : -20 % sur les boissons de 15 h à 17 h chez {commerce}.']},
  {type: 'Pizzeria', names: ['Pizzeria Nonna Luce', 'La Pizza du Four Doré'], threshold: 10, rewards: [[10, 'Pizza offerte', 'FREE_ITEM'], [5, 'Boisson offerte', 'FREE_ITEM']], closed: [1], pace: 2, messages: ['{prenom}, la pizza du mois est arrivée chez {commerce} !', 'Ce soir, dessert offert pour toute pizza achetée chez {commerce}.']},
  {type: 'Institut de beauté', names: ['Institut Sérénité', 'L’Instant Ambre'], threshold: 8, rewards: [[8, 'Soin visage offert', 'FREE_ITEM'], [4, '-15 % sur un soin', 'DISCOUNT_PERCENT', 15]], closed: [0, 1], pace: 1, messages: ['{prenom}, offrez-vous une pause : -15 % sur les soins du corps chez {commerce}.']},
  {type: 'Fleuriste', names: ['Atelier Pétales', 'Fleurs de Saison'], threshold: 10, rewards: [[10, 'Bouquet offert', 'FREE_ITEM']], closed: [1], pace: 1.5, messages: ['{prenom}, les premières pivoines sont arrivées chez {commerce}.']},
  {type: 'Barbier', names: ['Le Rasoir d’Or', 'Le Comptoir du Barbier'], threshold: 8, rewards: [[8, 'Coupe offerte', 'FREE_ITEM']], closed: [0, 1], pace: 1.2, messages: ['{prenom}, un créneau vous attend cette semaine chez {commerce}.']},
];
const COLORS: [string, string][] = [
  ['#1f1c17', '#f8f4ec'], ['#121216', '#e6c27a'], ['#7a3d1c', '#f8f4ec'], ['#9b1c1c', '#f8f4ec'], ['#14532d', '#f8f4ec'], ['#1e3a5f', '#f8f4ec'], ['#5b2a86', '#f8f4ec'], ['#f5efe4', '#1f1c17'],
];
const FIRST = ['Léa', 'Hugo', 'Chloé', 'Lucas', 'Manon', 'Nathan', 'Inès', 'Théo', 'Camille', 'Louis', 'Jade', 'Arthur', 'Zoé', 'Jules', 'Emma', 'Gabriel', 'Sarah', 'Adam', 'Lina', 'Raphaël', 'Alice', 'Noah', 'Rose', 'Tom', 'Anna', 'Paul', 'Juliette', 'Maël', 'Louise', 'Sacha', 'Ambre', 'Nolan', 'Clara', 'Ethan', 'Mila', 'Victor', 'Eva', 'Martin', 'Nina', 'Simon'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier'];
const STAFF_NAMES = ['Yanis', 'Sofia', 'Mehdi', 'Clémence', 'Lou', 'Karim', 'Océane', 'Bastien'];

// --- Génération ---------------------------------------------------------------------------------------
export interface DemoMerchant {
  seed: number;
  plan: Plan;
  merchant: {id: string; name: string; slug: string; business_type: string; logo_url: string | null; primary_color: string; secondary_color: string; address: string; postal_code: string; city: string; phone: string; website: string | null};
  program: any;
  rewards: any[];
  owner: string;
  tpl: Template;
}

/** Commerce, programme et récompenses d'une graine (aussi utilisé par la page d'inscription de démonstration). */
export function demoMerchant(seed: number): DemoMerchant {
  const r = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const tpl = pick(TEMPLATES);
  const [bg, fg] = pick(COLORS);
  const roll = r();
  const plan: Plan = roll < 0.2 ? 'ESSENTIEL' : roll < 0.7 ? 'GROWTH' : 'PRO';
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
  return {
    seed,
    plan,
    tpl,
    owner: pick(['Camille', 'Julien', 'Sophie', 'Karim', 'Élodie', 'Thomas', 'Nadia', 'Antoine']),
    merchant: {
      id: 'demo-merchant', name, slug: `demo-${seed}`, business_type: tpl.type, logo_url: null, primary_color: bg, secondary_color: fg,
      address: `${1 + Math.floor(r() * 80)} rue de l’Exemple`, postal_code: '34000', city: 'Montpellier', phone: `04 99 ${String(10 + Math.floor(r() * 89))} 00 00`, website: null,
    },
    program,
    rewards,
  };
}

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
  consents: {marketing_wallet: boolean; marketing_sms: boolean};
  apple: boolean;
  deleted?: boolean;
}

export function createMockBackend(seed: number): Backend {
  const d = demoMerchant(seed);
  const r = mulberry32(seed * 7 + 13);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const now = Date.now();
  let uid = 0;
  const id = () => `d${seed}-${++uid}`;
  const features = PLAN_FEATURES[d.plan];
  const has = (f: string) => features.includes(f);

  // Équipe
  const others = [...STAFF_NAMES].sort(() => r() - 0.5).slice(0, int(1, 3));
  const staff = [
    {id: 'st-owner', merchant_id: d.merchant.id, user_id: 'u-owner', role: 'OWNER', status: 'ACTIVE', display_name: d.owner, email: `${d.owner.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`, permissions: {}, last_seen_at: iso(now - 60000), created_at: iso(now - 200 * DAY)},
    ...others.map((n, i) => ({
      id: `st-${i}`, merchant_id: d.merchant.id, user_id: `u-${i}`, role: i === 0 && d.plan !== 'ESSENTIEL' && r() < 0.4 ? 'ADMIN' : 'STAFF',
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
    let phone: string | null = null;
    if (r() < 0.8) {
      do phone = `06 39 98 ${String(int(0, 99)).padStart(2, '0')} ${String(int(0, 99)).padStart(2, '0')}`;
      while (usedPhones.has(phone));
      usedPhones.add(phone);
    }
    const c: Cust = {
      id: `cu${i}`, first_name: first, last_name: last, phone,
      email: r() < 0.35 ? `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last.toLowerCase()}@example.com` : null,
      birthday: r() < 0.6 ? `${int(1960, 2006)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}` : null,
      created_at: iso(created), last: iso(visits[visits.length - 1]), balance: 0, visits: 0, rewards: [], tx: [],
      consents: {marketing_wallet: r() < 0.85, marketing_sms: false}, apple: r() < 0.55,
    };
    c.consents.marketing_sms = !!phone && r() < 0.45;
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

  // Campagnes
  const campaigns: any[] = [];
  if (has('campaigns.wallet')) {
    for (let k = 0; k < int(1, 3); k++) {
      const sentAt = now - int(6, 85) * DAY;
      const reach = customers.filter((c) => new Date(c.created_at).getTime() < sentAt && c.consents.marketing_wallet).length;
      campaigns.push({
        id: id(), merchant_id: d.merchant.id, name: pick(['Offre de la semaine', 'Nouveauté du mois', 'Merci pour votre fidélité', 'Rentrée', 'Week-end gourmand']), channel: 'WALLET', audience_type: 'ALL',
        audience_filter: {}, message_title: d.merchant.name, message_body: pick(d.tpl.messages), scheduled_at: null, sent_at: iso(sentAt), status: 'SENT',
        stats: {total: reach, sent: Math.round(reach * 0.93), failed: 0, skipped: reach - Math.round(reach * 0.93)}, error: null, created_at: iso(sentAt - DAY),
      });
    }
  }
  if (has('sms') && r() < 0.6) {
    const sentAt = now - int(10, 50) * DAY;
    const reach = customers.filter((c) => c.consents.marketing_sms && new Date(c.created_at).getTime() < sentAt).length;
    campaigns.push({
      id: id(), merchant_id: d.merchant.id, name: 'SMS clients absents', channel: 'SMS', audience_type: has('segmentation') ? 'INACTIVE_60' : 'ALL', audience_filter: {}, message_title: null,
      message_body: `{prenom}, -10 % sur votre prochaine visite chez {commerce}.`, scheduled_at: null, sent_at: iso(sentAt), status: 'SENT', stats: {total: reach, sent: reach, failed: 0, skipped: 0},
      error: null, created_at: iso(sentAt - DAY),
    });
  }
  if (has('campaigns.scheduled') && r() < 0.5) {
    const at = now + int(2, 6) * DAY;
    campaigns.push({id: id(), merchant_id: d.merchant.id, name: 'Annonce programmée', channel: 'WALLET', audience_type: 'ALL', audience_filter: {}, message_title: d.merchant.name, message_body: pick(d.tpl.messages), scheduled_at: iso(at), sent_at: null, status: 'SCHEDULED', stats: {}, error: null, created_at: iso(now - DAY)});
  }
  campaigns.push({id: id(), merchant_id: d.merchant.id, name: 'Brouillon : prochaine offre', channel: 'WALLET', audience_type: 'ALL', audience_filter: {}, message_title: '', message_body: pick(d.tpl.messages), scheduled_at: null, sent_at: null, status: 'DRAFT', stats: {}, error: null, created_at: iso(now - 3600000)});

  const db: Record<string, any[]> = {
    merchants: [d.merchant],
    merchant_settings: [
      {merchant_id: d.merchant.id, enrollment_collect_last_name: false, enrollment_collect_phone: true, enrollment_require_phone: false, enrollment_collect_email: false, enrollment_collect_birthday: true, terms_url: null, privacy_url: null, wallet_back_text: d.tpl.closed.includes(0) ? 'Du mardi au samedi, 9 h – 19 h.' : 'Tous les jours sauf le lundi, 7 h – 20 h.', notify_balance_updates: true, birthday_enabled: has('automation.birthday'), birthday_channel: 'WALLET', birthday_message: 'Joyeux anniversaire {prenom} ! Une surprise vous attend chez {commerce}.', inactive_enabled: false, inactive_after_days: 60, inactive_channel: 'WALLET', inactive_message: '{prenom}, cela fait longtemps ! Revenez nous voir chez {commerce}.', reengagement_cooldown_days: 30, marketing_min_interval_hours: 48, scan_undo_window_seconds: 120},
    ],
    loyalty_programs: [d.program],
    rewards: d.rewards,
    campaigns,
    merchant_staff: staff,
    permissions_catalog: PERMS.map(([permission, description]) => ({permission, description})),
    role_permissions: [...PERMS.map(([p]) => ({role: 'OWNER', permission: p})), ...PERMS.filter(([p]) => p !== 'integrations.manage').map(([p]) => ({role: 'ADMIN', permission: p})), ...STAFF_PERMS.map((p) => ({role: 'STAFF', permission: p}))],
    features_catalog: FEATURES_CATALOG.map(([feature, description]) => ({feature, description})),
    plan_entitlements: (['ESSENTIEL', 'GROWTH', 'PRO'] as Plan[]).flatMap((plan) => PLAN_FEATURES[plan].map((feature) => ({plan, feature, enabled: true}))),
  };

  function membership(): any {
    const m = db.merchants[0];
    return {
      staff_id: 'st-owner', merchant_id: m.id, merchant_name: m.name, merchant_slug: m.slug, merchant_status: 'ACTIVE', logo_url: m.logo_url, primary_color: m.primary_color,
      secondary_color: m.secondary_color, subscription_plan: d.plan, role: 'OWNER', display_name: d.owner, permissions: PERMS.map(([p]) => p),
      features: Object.fromEntries(features.map((f) => [f, {enabled: true, limit: f === 'sms.monthly_quota' ? SMS_QUOTA[d.plan] : null}])),
    };
  }

  function summary(c: Cust) {
    const prog = db.loyalty_programs[0];
    const target = prog.reward_threshold;
    const next = db.rewards.filter((x) => x.status === 'ACTIVE' && x.threshold > c.balance).sort((a, b) => a.threshold - b.threshold)[0];
    return {
      loyalty_account_id: `acc-${c.id}`, balance: c.balance, lifetime_balance: c.visits, visits_count: c.visits,
      program: {name: prog.name, type: prog.type, unit_singular: prog.unit_label_singular, unit_plural: prog.unit_label_plural, reward_threshold: target},
      progress: {current: c.balance, target, remaining: target - c.balance, label: `${c.balance} / ${target} ${prog.unit_label_plural}`},
      next_reward: next ? {name: next.name, remaining: next.threshold - c.balance} : null,
      available_rewards: c.rewards.filter((x) => x.status === 'AVAILABLE').map((x) => ({customer_reward_id: x.id, name: x.name, expires_at: null})),
    };
  }

  const alive = () => customers.filter((c) => !c.deleted);
  function period(from: number, to: number) {
    const per = new Map<string, number>();
    let visits = 0;
    let unlocked = 0;
    let redeemed = 0;
    for (const c of alive()) {
      for (const x of c.tx) {
        const t = new Date(x.created_at).getTime();
        if (x.type === 'EARN' && !x.reversed && t >= from && t < to) {
          visits++;
          per.set(c.id, (per.get(c.id) ?? 0) + 1);
        }
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
      wallet_notifications_sent: sent.filter((c) => c.channel === 'WALLET').reduce((a, c) => a + (c.stats?.sent ?? 0), 0),
      sms_segments_sent: sent.filter((c) => c.channel === 'SMS').reduce((a, c) => a + (c.stats?.sent ?? 0), 0),
    };
  }

  const wait = (ms = 220) => new Promise((res) => setTimeout(res, ms));
  let lastTx: {cust: Cust; txId: string; at: number} | null = null;
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

  const backend = {
    demo: true,
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
          return {user_id: 'u-owner', is_platform_admin: false, memberships: [membership()]};
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
          return {
            status: 'OK',
            customer: {id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email, birthday: c.birthday, status: 'ACTIVE', source: 'JOIN_PAGE', created_at: c.created_at, last_activity_at: c.last},
            account: summary(c),
            transactions: [...c.tx].reverse().slice(0, 50),
            rewards: [...c.rewards].reverse(),
            consents: {loyalty_terms: true, ...c.consents, consent_timestamp: c.created_at, consent_version: 'loyna-2026-09'},
            wallet: {pass_status: 'ACTIVE', apple_devices: c.apple ? 1 : 0, apple_last_fetched_at: null, google_object: !c.apple, google_has_users: !c.apple},
            permissions: {can_adjust: true, can_reverse_any: true, can_manage: true, can_redeem: true, can_reissue_card: true},
          };
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
          const c = customers.find((x) => `acc-${x.id}` === a.p_loyalty_account_id)!;
          if (c.balance + a.p_points_delta < 0) return {status: 'INSUFFICIENT_BALANCE'};
          c.balance += a.p_points_delta;
          c.tx.push({id: id(), seq: c.tx.length + 1, type: 'ADJUSTMENT', source: 'MANUAL', points_delta: a.p_points_delta, balance_after: c.balance, amount: null, note: a.p_reason, created_at: iso(Date.now()), staff_name: d.owner, reversed: false});
          return {status: 'OK'};
        }
        case 'my_subscription': {
          const yearly = seed % 4 === 0;
          return {status: 'OK', plan: d.plan, billing_period: yearly ? 'yearly' : 'monthly', subscription_status: 'active', cancel_at_period_end: false, cancel_at: null, canceled_at: null, current_period_end: iso(now + ((seed % 27) + 2) * DAY), commitment_end: iso(now + ((seed % 300) + 30) * DAY), customer_email: staff[0].email};
        }
      }
      throw new ApiError('UNKNOWN', 'Fonction non disponible en démonstration.');
    },
    async edge(fn: string, b: any): Promise<any> {
      await wait(320);
      switch (fn) {
        case 'validate-visit': {
          if (b.action === 'undo') {
            if (!lastTx) return {status: 'NOT_FOUND', display: {tone: 'error', title: 'Annulation impossible', lines: [], actions: []}};
            const {cust, txId} = lastTx;
            const x = cust.tx.find((t) => t.id === txId);
            if (x) x.reversed = true;
            cust.balance = Math.max(0, cust.balance - 1);
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
          const pool = alive().filter((c) => (now - new Date(c.last).getTime()) / DAY < 60);
          const c = again && lastTx ? lastTx.cust : pick(pool.length ? pool : alive());
          c.balance += 1;
          c.visits += 1;
          c.last = iso(Date.now());
          let unlocked: string | null = null;
          for (const rw of db.rewards.filter((x) => x.status === 'ACTIVE')) {
            if (c.balance === rw.threshold) {
              unlocked = rw.name;
              c.rewards.push({id: id(), name: rw.name, status: 'AVAILABLE', earned_at: iso(Date.now()), redeemed_at: null});
            }
          }
          const txId = id();
          c.tx.push({id: txId, seq: c.tx.length + 1, type: 'EARN', source: 'QR_SCAN', points_delta: 1, balance_after: c.balance, amount: b.amount ?? null, note: null, created_at: iso(Date.now()), staff_name: d.owner, reversed: false});
          const display = scanDisplay(c, unlocked);
          if (c.balance >= db.loyalty_programs[0].reward_threshold) c.balance = 0;
          lastTx = {cust: c, txId, at: Date.now()};
          return {status: 'OK', transaction_id: txId, customer: {id: c.id, first_name: c.first_name}, display};
        }
        case 'redeem-reward': {
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
          if (b.action === 'preview') {
            const total = alive().length;
            const sms = c.channel === 'SMS';
            const eligible = alive().filter((x) => (sms ? x.consents.marketing_sms && x.phone : x.consents.marketing_wallet)).length;
            const base = {status: 'OK', campaign_id: c.id, channel: c.channel, audience_type: c.audience_type, audience_total: total, eligible, skipped: sms ? {NO_CONSENT: total - eligible} : {NO_CONSENT: total - eligible}, feature_missing: null};
            if (!sms) return base;
            const segs = c.message_body.length > 140 ? 2 : 1;
            const quota = SMS_QUOTA[d.plan] ?? 0;
            return {...base, sms: {summary: `Ce message représente ${segs} SMS par destinataire.`, segments_per_recipient: segs, total_sms_estimated: segs * eligible, quota_remaining: quota, quota_ok: segs * eligible <= quota, within_sending_hours: true}};
          }
          if (b.action === 'launch') {
            const eligible = alive().filter((x) => x.consents.marketing_wallet).length;
            c.status = b.scheduled_at ? 'SCHEDULED' : 'SENT';
            c.scheduled_at = b.scheduled_at ?? null;
            c.sent_at = b.scheduled_at ? null : iso(Date.now());
            c.stats = b.scheduled_at ? {} : {total: eligible, sent: eligible, failed: 0, skipped: 0};
            return b.scheduled_at ? {status: 'SCHEDULED', scheduled_at: b.scheduled_at} : {status: 'SENDING', eligible};
          }
          if (b.action === 'cancel') {
            c.status = 'CANCELLED';
            return {status: 'CANCELLED'};
          }
          const sent = c.stats?.sent ?? 0;
          const back = Math.round(sent * (0.15 + ((seed % 20) / 100)));
          return {status: 'OK', recipients_sent: sent, returned_within_7_days: back, return_rate_7_days: sent ? Math.round((1000 * back) / sent) / 10 : null};
        }
        case 'sms-send': {
          const t: string = b.text;
          const uni = /[^\x00-\x7FàâäéèêëïîôöùûüçÀÉÈ€]/.test(t);
          const segs = Math.max(1, Math.ceil((t.length + 11) / (uni ? 67 : 153)));
          const analysis = {encoding: uni ? 'UCS2' : 'GSM7', segments: segs, summary: `Ce message représente ${segs} SMS par destinataire.`, warnings: uni ? ['Caractères spéciaux ou emojis détectés : le message passe en Unicode (70 caractères par SMS au lieu de 160).'] : []};
          if (b.action === 'analyze') return analysis;
          const optimized = t.replace(/[’‘]/g, "'").replace(/[«»]/g, '"').replace(/\p{Extended_Pictographic}/gu, '');
          return {original: t, optimized, changed: optimized !== t, changes: optimized !== t ? [{from: '’', to: "'", count: 1, reason: 'caractère Unicode remplacé'}] : [], before: analysis, after: {...analysis, segments: Math.max(1, segs - (uni ? 1 : 0))}, savedSegmentsPerRecipient: uni ? Math.max(0, segs - 1) : 0};
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
          if (b.marketing_sms === false) c.consents.marketing_sms = false;
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
      const x = {id: id(), created_at: iso(Date.now()), status: 'DRAFT', stats: {}, ...row};
      if (table === 'rewards') x.status = row.status ?? 'ACTIVE';
      db[table].push(x);
      return {...x};
    },
    async update(table: string, match: Match, changes: any): Promise<any> {
      await wait(180);
      const x = db[table].find((y) => Object.entries(match).every(([k, v]) => y[k] === v));
      if (!x) throw new ApiError('PGRST116', 'Élément introuvable.');
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

/** Page d'inscription de démonstration (loyna.fr/join/demo-<graine>), cohérente avec le commerce fictif. */
export function demoJoinPage(seed: number) {
  const d = demoMerchant(seed);
  const has = (f: string) => PLAN_FEATURES[d.plan].includes(f);
  return {
    status: 'OK' as const,
    demo: true,
    merchant: {name: d.merchant.name, slug: d.merchant.slug, business_type: d.merchant.business_type, logo_url: null, primary_color: d.merchant.primary_color, secondary_color: d.merchant.secondary_color, city: d.merchant.city, website: null},
    program: {name: d.program.name, type: 'VISITS', points_per_event: 1, spend_points_per_unit: null, reward_threshold: d.program.reward_threshold, unit_singular: 'passage', unit_plural: 'passages'},
    rewards: [...d.rewards].sort((a, b) => a.threshold - b.threshold).map((x) => ({name: x.name, description: null, threshold: x.threshold})),
    form: {collect_last_name: false, collect_phone: true, require_phone: false, collect_email: false, collect_birthday: true, offer_sms_consent: has('sms')},
    legal: {terms_url: null, privacy_url: null, consent_version: 'loyna-2026-09'},
    platform: null,
  };
}
