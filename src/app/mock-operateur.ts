// Essai local de l'écran Opérateur (développement seulement : /espace-client/?demo&operateur, ou &operateur=seul pour
// un opérateur sans commerce). Réponses fictives de op_orders, op_merchants et merchant-bootstrap, gardées en mémoire ;
// rien n'est envoyé. Ce module n'est chargé que si import.meta.env.DEV : il n'existe pas dans le site publié (la
// démonstration publique n'a pas d'onglet Opérateur). Téléphones en 06 39 98 (tranche ARCEP réservée à la fiction),
// e-mails en example.com.
import {ApiError} from './http';

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString();

/** Commerce fictif de la démonstration, dont l'opérateur fait partie (bouton « Ouvrir »). */
export interface SelfMerchant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  primary_color: string;
  secondary_color: string;
  cards: number;
  owner_email: string;
  member: boolean;
}

const now = Date.now();
const premiumItems = [
  {lookup_key: 'loyna_premium_monthly', label: 'LOYNA Premium', quantity: 1, amount: 3999},
  {lookup_key: 'loyna_setup_fee', label: 'Mise en service', quantity: 1, amount: 0},
  {lookup_key: 'loyna_qr_verre', label: 'QR code personnalisé sous verre', quantity: 2, amount: 1998},
];
let orders: any[] = [
  {
    id: 'sub_DemoLien1', business_name: 'Barbier des Arceaux (démo)', customer_name: 'Hugo Martin', customer_email: 'barbier.arceaux@example.com',
    customer_phone: '+33639981234', plan: 'PREMIUM', billing_period: 'monthly', status: 'active', ordered_at: iso(now - 2 * 3600000),
    current_period_end: iso(now + 30 * DAY), commitment_end: iso(now + 365 * DAY), cancel_at: null, source: 'loyna.fr', items: premiumItems,
    account: null, referral: null,
  },
  {
    id: 'sub_DemoPanier1', business_name: 'Fleurs de la Comédie (démo)', customer_name: 'Inès Garcia', customer_email: 'ines.garcia@example.com',
    customer_phone: '+33639985678', plan: 'PRO', billing_period: 'monthly', status: 'active', ordered_at: iso(now - DAY - 5 * 3600000),
    current_period_end: iso(now + 29 * DAY), commitment_end: iso(now + 364 * DAY), cancel_at: null, source: 'loyna.fr/panier',
    items: [
      {lookup_key: 'loyna_pro_monthly', label: 'LOYNA Pro', quantity: 1, amount: 8900},
      {lookup_key: 'loyna_qr_verre_5', label: 'Pack de 5 QR codes personnalisés sous verre', quantity: 1, amount: 4249},
    ],
    account: {user_id: 'u-demo-panier', email: 'ines.garcia@example.com', email_confirmed: true, display_name: 'Inès Garcia', business_name: 'Fleurs de la Comédie (démo)', found_by: 'order', owned_merchants: 0},
    referral: {code: 'LOYNA-K7Q2MX', status: 'gagne', referrer_name: 'Atelier Barbe & Co (démo)', referrer_email: 'atelier.barbe@example.com'},
  },
  {
    id: 'sub_DemoMail1', business_name: 'Café Saint-Roch (démo)', customer_name: 'Louis Bernard', customer_email: 'cafe.saintroch@example.com',
    customer_phone: null, plan: 'STARTER', billing_period: 'yearly', status: 'incomplete', ordered_at: iso(now - 40 * 60000),
    current_period_end: null, commitment_end: null, cancel_at: null, source: 'loyna.fr', items: [{lookup_key: 'loyna_starter_yearly', label: 'LOYNA Starter', quantity: 1, amount: 29580}],
    account: {user_id: 'u-demo-cafe', email: 'cafe.saintroch@example.com', email_confirmed: false, display_name: null, business_name: null, found_by: 'email', owned_merchants: 0},
    referral: null,
  },
];
const others: any[] = [
  {id: 'm-demo-1', name: 'Atelier Barbe & Co (démo)', slug: 'atelier-barbe-demo', status: 'ACTIVE', business_type: 'Barbier', subscription_plan: 'PRO', logo_url: null, primary_color: '#121216', secondary_color: '#d9b27a', created_at: iso(now - 40 * DAY), cards: 212, owner_email: 'atelier.barbe@example.com', owner_status: 'ACTIVE', subscription_status: 'active', is_member: false},
  {id: 'm-demo-2', name: 'Boulangerie du Lez (démo)', slug: 'boulangerie-du-lez-demo', status: 'ACTIVE', business_type: 'Boulangerie', subscription_plan: 'PREMIUM', logo_url: null, primary_color: '#7a3d1c', secondary_color: '#f2c879', created_at: iso(now - 12 * DAY), cards: 87, owner_email: 'boulangerie.lez@example.com', owner_status: 'INVITED', subscription_status: 'active', is_member: false},
];
const created: any[] = [];

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function merchants(self: SelfMerchant) {
  const mine = {
    id: self.id, name: self.name, slug: self.slug, status: 'ACTIVE', business_type: null, subscription_plan: self.plan, logo_url: null, primary_color: self.primary_color,
    secondary_color: self.secondary_color, created_at: iso(now - 200 * DAY), cards: self.cards, owner_email: self.owner_email, owner_status: 'ACTIVE', subscription_status: 'active', is_member: self.member,
  };
  return [...created, ...others, mine];
}

export async function operatorRpc(fn: string, self: SelfMerchant): Promise<any> {
  await wait();
  if (fn === 'op_orders') return {status: 'OK', orders: JSON.parse(JSON.stringify(orders))};
  if (fn === 'op_merchants') return {status: 'OK', merchants: JSON.parse(JSON.stringify(merchants(self)))};
  throw new ApiError('UNKNOWN', 'Fonction non disponible en démonstration.');
}

const fakeLink = () => `https://loyna.fr/espace-client/mot-de-passe/?token_hash=demo${Math.random().toString(36).slice(2, 12)}&type=recovery`;

export async function operatorEdge(b: any, self: SelfMerchant): Promise<any> {
  await wait(600);
  if (b.action === 'send_access') {
    const m = created.find((x) => x.id === b.merchant_id);
    if (!m) throw new ApiError('NOT_FOUND', 'Commerce introuvable.', 404);
    return {status: 'SENT', to: m.owner_email, setup_link: fakeLink()};
  }
  const slug = b.merchant?.slug;
  if (merchants(self).some((m) => m.slug === slug)) {
    throw new ApiError('SLUG_TAKEN', 'Cette adresse d’inscription est déjà utilisée : choisissez-en une autre.', 409, {status: 'SLUG_TAKEN'});
  }
  const email = String(b.owner?.email ?? '').toLowerCase();
  const linked = orders.filter((o) => o.account?.email === email || o.customer_email === email);
  const existing = linked.some((o) => o.account?.email === email);
  orders = orders.filter((o) => !linked.includes(o));
  const plan = linked[0]?.plan ?? b.merchant.subscription_plan;
  created.unshift({
    id: b.merchant.id, name: b.merchant.name, slug, status: 'ACTIVE', business_type: b.merchant.business_type ?? null, subscription_plan: plan, logo_url: b.merchant.logo_url ?? null,
    primary_color: b.merchant.primary_color, secondary_color: b.merchant.secondary_color, created_at: iso(Date.now()), cards: 0, owner_email: email, owner_status: 'INVITED',
    subscription_status: linked[0]?.status ?? null, is_member: false,
  });
  return {
    status: 'CREATED', merchant_id: b.merchant.id, slug, join_url: `https://loyna.fr/join/${slug}`, orders_linked: linked.length, subscription_plan: plan,
    owner: {user_id: `u-demo-${slug}`, account_created: !existing, setup_link: fakeLink()},
  };
}
