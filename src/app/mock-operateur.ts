// Essai local de l'écran Opérateur (développement seulement : /espace-client/?demo&operateur, ou &operateur=seul pour
// un opérateur sans commerce). Réponses fictives de op_orders, op_merchants, des actions op_* et de merchant-bootstrap,
// gardées en mémoire ; rien n'est envoyé. Ce module n'est chargé que si import.meta.env.DEV : il n'existe pas dans le site
// publié (la démonstration publique n'a pas d'onglet Opérateur). Téléphones en 06 39 98 (tranche ARCEP réservée à la
// fiction), e-mails en example.com.
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
let orders: any[] = [
  {
    id: 'sub_DemoLien1', business_name: 'Barbier des Arceaux (démo)', customer_name: 'Hugo Martin', customer_email: 'barbier.arceaux@example.com',
    customer_phone: '+33639981234', plan: 'STARTER', billing_period: 'monthly', status: 'active', ordered_at: iso(now - 2 * 3600000),
    current_period_end: iso(now + 30 * DAY), commitment_end: iso(now + 365 * DAY), cancel_at: null, source: 'loyna.fr',
    items: [
      {lookup_key: 'loyna_starter_commit12', label: 'LOYNA Starter', quantity: 1, amount: 2465},
      {lookup_key: 'loyna_qr_verre', label: 'QR code personnalisé sous verre', quantity: 2, amount: 1998},
    ],
    account: null, referral: null,
  },
  {
    id: 'sub_DemoPanier1', business_name: 'Fleurs de la Comédie (démo)', customer_name: 'Inès Garcia', customer_email: 'ines.garcia@example.com',
    customer_phone: '+33639985678', plan: 'PRO', billing_period: 'monthly', status: 'active', ordered_at: iso(now - DAY - 5 * 3600000),
    current_period_end: iso(now + 29 * DAY), commitment_end: null, cancel_at: null, source: 'loyna.fr/panier',
    items: [
      {lookup_key: 'loyna_pro_monthly', label: 'LOYNA Pro', quantity: 1, amount: 4900},
      {lookup_key: 'loyna_setup_fee', label: 'Mise en service', quantity: 1, amount: 0},
      {lookup_key: 'loyna_qr_verre_5', label: 'Pack de 5 QR codes personnalisés sous verre', quantity: 1, amount: 4249},
    ],
    account: {user_id: 'u-demo-panier', email: 'ines.garcia@example.com', email_confirmed: true, display_name: 'Inès Garcia', business_name: 'Fleurs de la Comédie (démo)', found_by: 'order', owned_merchants: 0},
    referral: {code: 'LOYNA-K7Q2MX', status: 'en_attente_paiement', referrer_name: 'Atelier Barbe & Co (démo)', referrer_email: 'atelier.barbe@example.com'},
  },
  {
    id: 'sub_DemoMail1', business_name: 'Café Saint-Roch (démo)', customer_name: 'Louis Bernard', customer_email: 'cafe.saintroch@example.com',
    customer_phone: null, plan: 'STARTER', billing_period: 'monthly', status: 'incomplete', ordered_at: iso(now - 40 * 60000),
    current_period_end: null, commitment_end: null, cancel_at: null, source: 'loyna.fr', items: [{lookup_key: 'loyna_starter_monthly', label: 'LOYNA Starter', quantity: 1, amount: 2900}],
    account: {user_id: 'u-demo-cafe', email: 'cafe.saintroch@example.com', email_confirmed: false, display_name: null, business_name: null, found_by: 'email', owned_merchants: 0},
    referral: null,
  },
];
// Mêmes champs que op_merchants ; `demo_mode` : état montré quand on ouvre son espace (mock.ts)
const service = {trial_ends_at: null as string | null, billing_exempt: false, service_stop_source: null as string | null, service_stop_reason: null as string | null, data_delete_after: null as string | null, siret: null as string | null, demo_mode: 'ACTIVE'};
const others: any[] = [
  {...service, id: 'm-demo-1', name: 'Atelier Barbe & Co (démo)', slug: 'atelier-barbe-demo', status: 'ACTIVE', business_type: 'Barbier', subscription_plan: 'PRO', logo_url: null, primary_color: '#121216', secondary_color: '#d9b27a', created_at: iso(now - 40 * DAY), cards: 212, owner_email: 'atelier.barbe@example.com', owner_status: 'ACTIVE', subscription_status: 'active', is_member: false},
  {...service, id: 'm-demo-2', name: 'Boulangerie du Lez (démo)', slug: 'boulangerie-du-lez-demo', status: 'ACTIVE', business_type: 'Boulangerie', subscription_plan: 'STARTER', logo_url: null, primary_color: '#7a3d1c', secondary_color: '#f2c879', created_at: iso(now - 12 * DAY), cards: 87, owner_email: 'boulangerie.lez@example.com', owner_status: 'INVITED', subscription_status: 'past_due', is_member: false, demo_mode: 'GRACE'},
  {...service, id: 'm-demo-3', name: 'Café de la Gare (démo)', slug: 'cafe-de-la-gare-demo', status: 'ACTIVE', business_type: 'Café', subscription_plan: 'STARTER', logo_url: null, primary_color: '#f5efe4', secondary_color: '#7a3d1c', created_at: iso(now - 9 * DAY), cards: 14, owner_email: 'cafe.gare@example.com', owner_status: 'ACTIVE', subscription_status: null, is_member: false, trial_ends_at: iso(now + 22 * DAY), siret: '00000000000000', demo_mode: 'TRIAL'},
  {...service, id: 'm-demo-4', name: 'Pressing du Parc (démo)', slug: 'pressing-du-parc-demo', status: 'SUSPENDED', business_type: 'Pressing', subscription_plan: 'STARTER', logo_url: null, primary_color: '#1e3a5f', secondary_color: '#7dd3fc', created_at: iso(now - 50 * DAY), cards: 31, owner_email: 'pressing.parc@example.com', owner_status: 'ACTIVE', subscription_status: null, is_member: false, trial_ends_at: iso(now - 19 * DAY), service_stop_source: 'AUTO', service_stop_reason: 'TRIAL_ENDED', data_delete_after: iso(now + 71 * DAY), siret: '00000000000000', demo_mode: 'STOP_TRIAL'},
  {...service, id: 'm-demo-5', name: 'Salon historique (démo)', slug: 'salon-historique-demo', status: 'ACTIVE', business_type: 'Barbier', subscription_plan: 'PREMIUM', logo_url: null, primary_color: '#121216', secondary_color: '#d9b27a', created_at: iso(now - 90 * DAY), cards: 140, owner_email: 'salon.historique@example.com', owner_status: 'ACTIVE', subscription_status: 'active', is_member: false},
  {...service, id: 'm-demo-6', name: 'Commerce offert (démo)', slug: 'commerce-offert-demo', status: 'ACTIVE', business_type: 'Boutique', subscription_plan: 'PRO', logo_url: null, primary_color: '#14532d', secondary_color: '#d9b27a', created_at: iso(now - 120 * DAY), cards: 6, owner_email: 'commerce.offert@example.com', owner_status: 'ACTIVE', subscription_status: null, is_member: false, billing_exempt: true, demo_mode: 'EXEMPT'},
];
const created: any[] = [];
const patches: Record<string, Record<string, unknown>> = {}; // actions de l'écran, par commerce

const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

function merchants(self: SelfMerchant) {
  const mine = {
    ...service, id: self.id, name: self.name, slug: self.slug, status: 'ACTIVE', business_type: null, subscription_plan: self.plan, logo_url: null, primary_color: self.primary_color,
    secondary_color: self.secondary_color, created_at: iso(now - 200 * DAY), cards: self.cards, owner_email: self.owner_email, owner_status: 'ACTIVE', subscription_status: 'active', is_member: self.member,
  };
  return [...created, ...others, mine].map((m) => ({...m, ...patches[m.id]}));
}

export async function operatorRpc(fn: string, self: SelfMerchant, a: any = {}): Promise<any> {
  await wait();
  if (fn === 'op_orders') return {status: 'OK', orders: JSON.parse(JSON.stringify(orders))};
  if (fn === 'op_merchants') return {status: 'OK', merchants: JSON.parse(JSON.stringify(merchants(self)))};
  if (fn === 'op_unlinked_subscriptions') return {status: 'OK', subscriptions: [{stripe_subscription_id: 'sub_demo_non_rattache', plan: 'STARTER', status: 'active', customer_email: 'autre.adresse@example.com', business_name: 'Commande non rattachée (démo)', created_at: iso(now - 3 * DAY)}]};
  if (fn === 'op_release_trial_siret') {
    if (!String(a.p_reason ?? '').trim()) return {status: 'REASON_REQUIRED'};
    for (const x of merchants(self)) if (x.siret === a.p_siret) patches[x.id] = {...patches[x.id], siret: null};
    return {status: 'OK', claims_released: 1, merchants: []};
  }
  const m = merchants(self).find((x) => x.id === a.p_merchant_id);
  if (!m) throw new ApiError('NOT_FOUND', 'Commerce introuvable.', 404);
  const patch = (changes: Record<string, unknown>) => {
    patches[m.id] = {...patches[m.id], ...changes};
    return {status: 'OK'};
  };
  const later = (from: string | null | undefined, days: number) => iso(Math.max(from ? new Date(from).getTime() : 0, Date.now()) + days * DAY);
  switch (fn) {
    case 'op_set_merchant_suspension':
      if (a.p_suspended && !String(a.p_reason ?? '').trim()) throw new ApiError('REASON_REQUIRED', 'Indiquez le motif de la suspension.', 400);
      return a.p_suspended
        ? patch({status: 'SUSPENDED', service_stop_source: 'MANUAL', service_stop_reason: 'OPERATOR', data_delete_after: null, demo_mode: 'MANUAL'})
        : patch({status: 'ACTIVE', service_stop_source: null, service_stop_reason: null, demo_mode: m.billing_exempt ? 'EXEMPT' : 'ACTIVE'});
    case 'op_set_billing_exempt':
      return patch({billing_exempt: !!a.p_exempt, demo_mode: a.p_exempt ? 'EXEMPT' : 'ACTIVE'});
    case 'op_extend_trial':
      return patch({trial_ends_at: later(m.trial_ends_at, a.p_days)});
    case 'op_extend_retention':
      return patch({data_delete_after: later(m.data_delete_after, a.p_days)});
    case 'op_attach_subscription':
      return patch({subscription_status: 'active', demo_mode: 'ACTIVE'});
    case 'op_prepare_campaign':
      return {status: 'OK', campaign_id: `camp-demo-${Date.now()}`};
  }
  throw new ApiError('UNKNOWN', 'Fonction non disponible en démonstration.');
}

const fakeLink = () => `https://loyna.fr/espace-client/mot-de-passe/?token_hash=demo${Math.random().toString(36).slice(2, 12)}&type=recovery`;

export async function operatorEdge(b: any, self: SelfMerchant): Promise<any> {
  await wait(600);
  if (b.action === 'send_access') {
    const m = merchants(self).find((x) => x.id === b.merchant_id);
    if (!m) throw new ApiError('NOT_FOUND', 'Commerce introuvable.', 404);
    return {status: 'SENT', to: m.owner_email, setup_link: fakeLink()};
  }
  if (b.action === 'commitment_exit') {
    if (!String(b.justificatif ?? '').trim()) throw new ApiError('INVALID_REQUEST', 'Décrivez le justificatif reçu.', 400);
    return {status: 'OK', ends_at: iso(Date.now() + 20 * DAY)};
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
  // Sans abonnement relié ni compte offert : un essai d'un mois (srv_bootstrap_merchant)
  const trial = !linked.length && !b.exempt;
  created.unshift({
    ...service, id: b.merchant.id, name: b.merchant.name, slug, status: 'ACTIVE', business_type: b.merchant.business_type ?? null, subscription_plan: plan, logo_url: b.merchant.logo_url ?? null,
    primary_color: b.merchant.primary_color, secondary_color: b.merchant.secondary_color, created_at: iso(Date.now()), cards: 0, owner_email: email, owner_status: 'INVITED',
    subscription_status: linked[0]?.status ?? null, is_member: false, billing_exempt: !!b.exempt, trial_ends_at: trial ? iso(Date.now() + 30 * DAY) : null, siret: b.siret ?? null, demo_mode: b.exempt ? 'EXEMPT' : trial ? 'TRIAL' : 'ACTIVE',
  });
  return {
    status: 'CREATED', merchant_id: b.merchant.id, slug, join_url: `https://loyna.fr/join/${slug}`, orders_linked: linked.length, subscription_plan: plan,
    owner: {user_id: `u-demo-${slug}`, account_created: !existing, setup_link: fakeLink()},
  };
}
